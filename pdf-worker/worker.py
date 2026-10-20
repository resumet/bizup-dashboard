"""Durable Supabase queue consumer. Run only in a private worker container."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from jsonschema import validate

ROOT = Path(__file__).resolve().parent
BUCKET = "course-document-pdfs"


class Worker:
    def __init__(self):
        self.base = os.environ.get("SUPABASE_URL", os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
        self.key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.origin = os.environ["APP_ORIGIN"].rstrip("/")
        if not self.base.startswith("https://") or not self.origin.startswith(("https://", "http://localhost:")):
            raise ValueError("SUPABASE_URL and APP_ORIGIN must be configured")

    def request(self, route, method="GET", body=None, mime="application/json"):
        data = json.dumps(body).encode() if body is not None and mime == "application/json" else body
        req = urllib.request.Request(self.base + route, data=data, method=method, headers={
            "apikey": self.key, "Authorization": "Bearer " + self.key,
            "Content-Type": mime, "Prefer": "return=representation", "x-upsert": "true",
        })
        with urllib.request.urlopen(req, timeout=60) as response:
            payload = response.read(85 * 1024 * 1024)
        return json.loads(payload) if payload and mime == "application/json" else payload

    def update(self, job, **fields):
        from datetime import datetime, timezone
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        rows = self.request(f"/rest/v1/course_document_pdf_imports?id=eq.{job['id']}&lease_token=eq.{job['lease_token']}&status=eq.processing", "PATCH", fields)
        if not rows:
            raise RuntimeError("LEASE_LOST")

    def upload(self, path, data, mime):
        route = f"/storage/v1/object/{BUCKET}/" + urllib.parse.quote(path, safe="/")
        self.request(route, "POST", data, mime)

    def process(self, job):
        print(json.dumps({"job": job["id"], "stage": "start"}), flush=True)
        try:
            with tempfile.TemporaryDirectory() as directory:
                temp = Path(directory)
                source = temp / "source.pdf"
                route = f"/storage/v1/object/authenticated/{BUCKET}/" + urllib.parse.quote(job["source_path"], safe="/")
                req = urllib.request.Request(self.base + route, headers={"apikey": self.key, "Authorization": "Bearer " + self.key})
                limit = min(int(os.environ.get("PDF_MAX_FILE_BYTES", 52428800)), 52428800)
                with urllib.request.urlopen(req, timeout=60) as response:
                    data = response.read(limit + 1)
                if len(data) > limit or len(data) != job["file_size"] or not data.startswith(b"%PDF-"):
                    raise ValueError("파일 크기 또는 PDF 형식이 올바르지 않습니다.")
                if hashlib.sha256(data).hexdigest() != job["sha256"]:
                    raise ValueError("업로드된 PDF가 원본과 다릅니다. 다시 업로드해 주세요.")
                source.write_bytes(data)
                out = temp / "result"
                out.mkdir()
                # Parser receives no Supabase/API credentials. Docker supplies memory/CPU/PID limits.
                env = {k: v for k, v in os.environ.items() if k in ("PATH", "SYSTEMROOT", "TEMP", "TMP", "TESSDATA_PREFIX", "LANG")}
                process = subprocess.Popen([sys.executable, str(ROOT / "convert.py"), str(source), str(out), json.dumps(job["options"]), str(min(int(os.environ.get("PDF_MAX_PAGES", 100)), 100))], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                started = time.monotonic()
                try:
                    while process.poll() is None:
                        if time.monotonic() - started > 300:
                            raise ValueError("변환 시간이 초과되었습니다. PDF를 나누어 다시 시도해 주세요.")
                        page_progress = out / "progress.json"
                        try:
                            state = json.loads(page_progress.read_text())
                            self.update(job, stage="페이지 이미지 생성", progress=15 + int(65 * state["page"] / state["total"]))
                        except (OSError, json.JSONDecodeError):
                            self.update(job, stage="페이지 이미지 준비", progress=15)
                        time.sleep(2)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait()
                if process.returncode != 0:
                    error_path = out / "error.json"
                    message = json.loads(error_path.read_text(encoding="utf-8"))["message"] if error_path.exists() else "PDF 이미지 생성에 실패했습니다. 파일을 확인해 주세요."
                    raise ValueError(message)
                raw = out / "result.json"
                if raw.stat().st_size > 8 * 1024 * 1024:
                    raise ValueError("변환 결과가 너무 큽니다. PDF를 나누어 주세요.")
                result = json.loads(raw.read_text(encoding="utf-8"))
                validate(result, json.loads((ROOT / "ir.schema.json").read_text(encoding="utf-8")))
                self.update(job, stage="저장", progress=85)
                prefix = job["source_path"].rsplit("/", 1)[0]
                for asset in out.glob("*.png"):
                    self.upload(prefix + "/" + asset.name, asset.read_bytes(), "image/png")
                for block in result["blocks"]:
                    if block["node"]["type"] == "image":
                        asset = block["node"]["attrs"]["src"]
                        block["node"]["attrs"]["src"] = f"{self.origin}/api/course-document-pdfs/assets/{job['id']}/{asset}"
                self.upload(prefix + "/ir.json", json.dumps(result, ensure_ascii=False).encode(), "application/json")
                review = any(block["issues"] for block in result["blocks"])
                self.update(job, status="needs_review" if review else "completed", stage="검수 필요" if review else "완료", progress=100, result=result, error_message=None)
                print(json.dumps({"job": job["id"], "stage": "completed", "pages": result["pageCount"], "seconds": round(time.monotonic()-started)}), flush=True)
        except Exception as error:
            if str(error) == "LEASE_LOST":
                return
            message = str(error) if isinstance(error, ValueError) else "PDF 변환에 실패했습니다. 잠시 후 다시 시도해 주세요."
            self.update(job, status="failed", stage="실패", error_message=message[:500])
            print(json.dumps({"job": job["id"], "stage": "failed", "error_type": type(error).__name__}), flush=True)

    def run(self):
        last_cleanup = 0
        while True:
            try:
                if time.monotonic() - last_cleanup > 60:
                    self.cleanup_deleted_documents()
                    last_cleanup = time.monotonic()
                jobs = self.request("/rest/v1/rpc/claim_course_document_pdf_import", "POST", {})
                if jobs:
                    self.process(jobs[0])
                else:
                    time.sleep(3)
            except Exception as error:
                print(json.dumps({"stage": "queue_error", "error_type": type(error).__name__}), flush=True)
                time.sleep(5)

    def cleanup_deleted_documents(self):
        jobs = self.request("/rest/v1/course_document_pdf_imports?select=id,source_path,course_documents!inner(deleted_at)&course_documents.deleted_at=not.is.null&status=not.in.(queued,processing)&limit=20")
        for job in jobs:
            prefix = job["source_path"].rsplit("/", 1)[0]
            files = self.request(f"/storage/v1/object/list/{BUCKET}", "POST", {"prefix": prefix, "limit": 1000, "offset": 0})
            if files:
                self.request(f"/storage/v1/object/{BUCKET}", "DELETE", {"prefixes": [prefix + "/" + file["name"] for file in files]})
            self.request(f"/rest/v1/course_document_pdf_imports?id=eq.{job['id']}", "DELETE")
            print(json.dumps({"job": job["id"], "stage": "deleted"}), flush=True)


if __name__ == "__main__":
    Worker().run()
