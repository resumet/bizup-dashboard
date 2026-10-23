import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import threading
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = FastAPI(title="BizUp YouTube Download Worker", docs_url=None, redoc_url=None)
SANDBOX_DOWNLOADS = os.getenv("SANDBOX_DOWNLOADS") == "1"
if SANDBOX_DOWNLOADS:
    # Status requires a signed, short-lived capability URL; cookies are not used.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "Content-Length"],
    )

job_lock = threading.Lock()
job: dict = {"status": "idle"}

VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtube-nocookie.com",
}
MAX_FILE_SIZE = 500 * 1024 * 1024
MAX_TRANSCRIPTION_PART_SIZE = 24 * 1024 * 1024
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}


def downloader_options() -> dict:
    options = {"socket_timeout": 20, "retries": 3}
    if SANDBOX_DOWNLOADS:
        import imageio_ffmpeg
        options["ffmpeg_location"] = imageio_ffmpeg.get_ffmpeg_exe()
        options["js_runtimes"] = {"node": {}}
    return options


class VideoRequest(BaseModel):
    url: str


class UploadRequest(BaseModel):
    filename: str
    size: int
    content_type: str = ""


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def verify_service_token(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {required_env('WORKER_API_TOKEN')}"
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def normalize_youtube_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if (
        parsed.scheme != "https"
        or parsed.hostname not in YOUTUBE_HOSTS
        or parsed.username
        or parsed.password
        or parsed.port
    ):
        raise HTTPException(status_code=400, detail="HTTPS 유튜브 주소만 사용할 수 있습니다.")

    video_id = ""
    if parsed.hostname == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif parsed.path == "/watch":
        video_id = parse_qs(parsed.query).get("v", [""])[0]
    else:
        matched = re.match(r"^/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})(?:/|$)", parsed.path)
        video_id = matched.group(1) if matched else ""

    if not VIDEO_ID_PATTERN.fullmatch(video_id):
        raise HTTPException(status_code=400, detail="재생목록이 아닌 단일 영상 주소를 입력해 주세요.")
    return f"https://www.youtube.com/watch?v={video_id}"


def safe_info(url: str) -> dict:
    try:
        with YoutubeDL({**downloader_options(), "quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
    except DownloadError as error:
        raise HTTPException(status_code=400, detail="공개 영상 정보를 확인하지 못했습니다.") from error

    if not isinstance(info, dict):
        raise HTTPException(status_code=400, detail="영상 정보가 올바르지 않습니다.")
    if info.get("is_live") is True or info.get("live_status") == "is_live":
        raise HTTPException(status_code=400, detail="실시간 스트리밍은 다운로드할 수 없습니다.")
    return info


def public_info(info: dict) -> dict:
    return {
        "id": str(info.get("id") or ""),
        "title": str(info.get("title") or "YouTube video"),
        "channel": str(info.get("channel") or info.get("uploader") or ""),
        "duration": int(info.get("duration") or 0),
        "thumbnail": str(info.get("thumbnail") or "") if str(info.get("thumbnail") or "").startswith("https://") else "",
    }


def encode_download_token(url: str) -> str:
    payload = json.dumps({"url": url, "exp": int(time.time()) + (1200 if SANDBOX_DOWNLOADS else 600)}, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(required_env("DOWNLOAD_SIGNING_SECRET").encode(), encoded, hashlib.sha256).digest()
    return f"{encoded.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def decode_download_token(token: str) -> str:
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected = hmac.new(required_env("DOWNLOAD_SIGNING_SECRET").encode(), encoded.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(supplied_signature + "=" * (-len(supplied_signature) % 4))
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return normalize_youtube_url(str(payload["url"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=401, detail="다운로드 주소가 만료되었거나 올바르지 않습니다.") from error


def encode_job_token(job_id: str) -> str:
    payload = json.dumps({"job_id": job_id, "exp": int(time.time()) + 1500}, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(required_env("DOWNLOAD_SIGNING_SECRET").encode(), encoded, hashlib.sha256).digest()
    return f"{encoded.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def decode_job_token(token: str) -> str:
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected = hmac.new(required_env("DOWNLOAD_SIGNING_SECRET").encode(), encoded.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(supplied_signature + "=" * (-len(supplied_signature) % 4))
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return str(payload["job_id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=401, detail="작업 주소가 만료되었거나 올바르지 않습니다.") from error


def download_file(url: str) -> tuple[Path, Path]:
    directory = Path(tempfile.mkdtemp(prefix="bizup-youtube-"))
    output = str(directory / "%(title).120B.%(ext)s")
    try:
        with YoutubeDL({
            **downloader_options(),
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "max_filesize": MAX_FILE_SIZE,
            "merge_output_format": "mp4",
            "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
            "outtmpl": output,
        }) as ydl:
            ydl.extract_info(url, download=True)
        files = [path for path in directory.iterdir() if path.is_file() and path.suffix not in {".part", ".ytdl"}]
        if not files:
            raise HTTPException(status_code=400, detail="다운로드 파일을 찾지 못했습니다.")
        result = files[0]
        if result.stat().st_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="500MB를 초과하는 영상은 다운로드할 수 없습니다.")
        return directory, result
    except HTTPException:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    except DownloadError as error:
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=400, detail="공개 영상을 다운로드하지 못했습니다.") from error
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


def safe_filename(value: str, fallback: str = "video") -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "_", value).strip(" .")
    return cleaned[:100] or fallback


def validate_upload(body: UploadRequest) -> tuple[str, str]:
    filename = Path(body.filename).name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="MP4, MOV, M4V, WEBM, MKV, AVI 영상만 업로드할 수 있습니다.")
    if body.size <= 0 or body.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="영상 파일은 500MB 이하여야 합니다.")
    if body.content_type and not body.content_type.startswith("video/") and body.content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail="영상 파일 형식을 확인해 주세요.")
    return filename, extension


def run_ffmpeg(args: list[str], error_message: str) -> None:
    import imageio_ffmpeg

    process = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True,
        text=True,
        timeout=20 * 60,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(error_message)


def extract_audio(source: Path, directory: Path) -> Path:
    audio_path = directory / "audio.mp3"
    run_ffmpeg(
        ["-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", str(audio_path)],
        "영상에서 음성을 추출하지 못했습니다.",
    )
    if not audio_path.is_file() or audio_path.stat().st_size == 0:
        raise RuntimeError("추출된 음성 파일을 찾지 못했습니다.")
    return audio_path


def download_youtube_audio_source(url: str, directory: Path) -> tuple[Path, str]:
    info = safe_info(url)
    output = str(directory / "source.%(ext)s")
    try:
        with YoutubeDL({
            **downloader_options(),
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "max_filesize": MAX_FILE_SIZE,
            "format": "bestaudio/best",
            "outtmpl": output,
        }) as ydl:
            ydl.extract_info(url, download=True)
    except DownloadError as error:
        raise RuntimeError("공개 영상의 음성을 내려받지 못했습니다.") from error
    files = [path for path in directory.glob("source.*") if path.is_file() and path.suffix not in {".part", ".ytdl"}]
    if not files:
        raise RuntimeError("영상 음원 파일을 찾지 못했습니다.")
    if files[0].stat().st_size > MAX_FILE_SIZE:
        raise RuntimeError("500MB를 초과하는 영상은 처리할 수 없습니다.")
    return files[0], str(info.get("title") or "YouTube video")


def split_audio(audio_path: Path, directory: Path) -> list[Path]:
    if audio_path.stat().st_size <= MAX_TRANSCRIPTION_PART_SIZE:
        return [audio_path]
    chunks = directory / "chunks"
    chunks.mkdir()
    run_ffmpeg(
        ["-i", str(audio_path), "-f", "segment", "-segment_time", "900", "-c", "copy", str(chunks / "%03d.mp3")],
        "긴 음성 파일을 전사용으로 나누지 못했습니다.",
    )
    parts = sorted(chunks.glob("*.mp3"))
    if not parts or any(part.stat().st_size > MAX_TRANSCRIPTION_PART_SIZE for part in parts):
        raise RuntimeError("음성 파일을 전사 가능한 크기로 나누지 못했습니다.")
    return parts


def transcribe_audio(audio_path: Path, directory: Path) -> str:
    api_key = required_env("OPENAI_API_KEY")
    model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-transcribe").strip() or "gpt-transcribe"
    transcripts: list[str] = []
    with httpx.Client(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
        for index, part in enumerate(split_audio(audio_path, directory)):
            data = {"model": model, "response_format": "json"}
            if transcripts:
                data["prompt"] = f"이전 구간의 마지막 내용: {transcripts[-1][-1000:]}"
            with part.open("rb") as audio_file:
                response = client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    data=data,
                    files={"file": (f"audio-{index + 1}.mp3", audio_file, "audio/mpeg")},
                )
            if response.status_code >= 400:
                raise RuntimeError("음성을 텍스트로 변환하지 못했습니다. 잠시 후 다시 시도해 주세요.")
            try:
                text = str(response.json()["text"]).strip()
            except (KeyError, TypeError, ValueError) as error:
                raise RuntimeError("전사 결과가 올바르지 않습니다.") from error
            if text:
                transcripts.append(text)
    transcript = "\n\n".join(transcripts).strip()
    if not transcript:
        raise RuntimeError("영상에서 전사할 음성을 찾지 못했습니다.")
    return transcript


def finish_transcription(directory: Path, source: Path, title: str) -> None:
    try:
        audio_path = extract_audio(source, directory)
        transcript = transcribe_audio(audio_path, directory)
        text_path = directory / "transcript.txt"
        text_path.write_text(transcript, encoding="utf-8-sig")
        with job_lock:
            job.update(
                status="ready",
                title=title,
                transcript=transcript,
                audio_path=audio_path,
                text_path=text_path,
                audio_filename=f"{safe_filename(title)}_음성.mp3",
                text_filename=f"{safe_filename(title)}_대본.txt",
            )
    except Exception as error:
        shutil.rmtree(directory, ignore_errors=True)
        with job_lock:
            job.update(status="error", error=str(error) or "영상 대본 추출에 실패했습니다.")


def run_youtube_transcription(url: str, directory: Path) -> None:
    try:
        source, title = download_youtube_audio_source(url, directory)
        finish_transcription(directory, source, title)
    except Exception as error:
        shutil.rmtree(directory, ignore_errors=True)
        with job_lock:
            job.update(status="error", error=error.detail if isinstance(error, HTTPException) else str(error) or "영상 대본 추출에 실패했습니다.")


def transcription_urls(base_url: str, token: str, include_upload: bool = False) -> dict:
    result = {
        "statusUrl": f"{base_url}/v1/transcriptions/status?token={token}",
        "audioUrl": f"{base_url}/v1/transcriptions/audio?token={token}",
        "textUrl": f"{base_url}/v1/transcriptions/text?token={token}",
    }
    if include_upload:
        result["uploadUrl"] = f"{base_url}/v1/transcriptions/upload?token={token}"
    return result


def reserve_transcription_job(request: Request, status: str, **values) -> tuple[str, dict]:
    base_url = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/") or str(request.base_url).rstrip("/")
    job_id = uuid.uuid4().hex
    with job_lock:
        if job["status"] != "idle":
            raise HTTPException(status_code=409, detail="이미 처리 중인 작업이 있습니다.")
        job.clear()
        job.update(status=status, job_id=job_id, **values)
    return job_id, {"base_url": base_url, "token": encode_job_token(job_id)}


def verify_transcription_job(token: str) -> None:
    job_id = decode_job_token(token)
    if job.get("job_id") != job_id:
        raise HTTPException(status_code=404, detail="영상 대본 추출 작업을 찾을 수 없습니다.")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/v1/info", dependencies=[Depends(verify_service_token)])
def video_info(body: VideoRequest) -> dict:
    url = normalize_youtube_url(body.url)
    return {"info": public_info(safe_info(url))}


@app.post("/v1/transcriptions/youtube", dependencies=[Depends(verify_service_token)])
def prepare_youtube_transcription(body: VideoRequest, request: Request) -> dict:
    required_env("OPENAI_API_KEY")
    url = normalize_youtube_url(body.url)
    directory = Path(tempfile.mkdtemp(prefix="bizup-transcription-"))
    try:
        _, capability = reserve_transcription_job(request, "processing", directory=directory, source="youtube")
        threading.Thread(target=run_youtube_transcription, args=(url, directory), daemon=True).start()
        return transcription_urls(capability["base_url"], capability["token"])
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


@app.post("/v1/transcriptions/uploads", dependencies=[Depends(verify_service_token)])
def prepare_upload_transcription(body: UploadRequest, request: Request) -> dict:
    required_env("OPENAI_API_KEY")
    filename, extension = validate_upload(body)
    directory = Path(tempfile.mkdtemp(prefix="bizup-transcription-"))
    source_path = directory / f"source{extension}"
    try:
        _, capability = reserve_transcription_job(
            request,
            "waiting_upload",
            directory=directory,
            source="upload",
            source_path=source_path,
            expected_size=body.size,
            title=Path(filename).stem,
        )
        return transcription_urls(capability["base_url"], capability["token"], include_upload=True)
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


@app.put("/v1/transcriptions/upload")
async def upload_transcription_video(token: str, request: Request) -> dict:
    verify_transcription_job(token)
    with job_lock:
        if job.get("status") != "waiting_upload":
            raise HTTPException(status_code=409, detail="업로드할 수 있는 상태가 아닙니다.")
        job["status"] = "uploading"
        source_path = Path(job["source_path"])
        expected_size = int(job["expected_size"])
        directory = Path(job["directory"])
        title = str(job["title"])
    received = 0
    try:
        with source_path.open("wb") as target:
            async for chunk in request.stream():
                received += len(chunk)
                if received > expected_size or received > MAX_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="업로드 파일 크기가 올바르지 않습니다.")
                target.write(chunk)
        if received != expected_size:
            raise HTTPException(status_code=400, detail="영상 업로드가 완료되지 않았습니다. 다시 시도해 주세요.")
        with job_lock:
            job["status"] = "processing"
        threading.Thread(target=finish_transcription, args=(directory, source_path, title), daemon=True).start()
        return {"status": "processing"}
    except Exception as error:
        shutil.rmtree(directory, ignore_errors=True)
        with job_lock:
            job.update(status="error", error=error.detail if isinstance(error, HTTPException) else "영상 업로드에 실패했습니다.")
        raise


@app.get("/v1/transcriptions/status")
def transcription_status(token: str) -> dict:
    verify_transcription_job(token)
    with job_lock:
        result = {"status": job["status"]}
        if job.get("error"):
            result["error"] = job["error"]
        if job["status"] == "ready":
            result.update(title=job["title"], transcript=job["transcript"])
        return result


@app.get("/v1/transcriptions/audio")
def download_transcription_audio(token: str):
    verify_transcription_job(token)
    with job_lock:
        if job.get("status") != "ready":
            raise HTTPException(status_code=409, detail="음성 파일이 아직 준비되지 않았습니다.")
        path, filename = Path(job["audio_path"]), str(job["audio_filename"])
    return FileResponse(path, filename=filename, media_type="audio/mpeg", headers={"Cache-Control": "private, no-store"})


@app.get("/v1/transcriptions/text")
def download_transcription_text(token: str):
    verify_transcription_job(token)
    with job_lock:
        if job.get("status") != "ready":
            raise HTTPException(status_code=409, detail="텍스트 파일이 아직 준비되지 않았습니다.")
        path, filename = Path(job["text_path"]), str(job["text_filename"])
    return FileResponse(path, filename=filename, media_type="text/plain; charset=utf-8", headers={"Cache-Control": "private, no-store"})


@app.post("/v1/downloads", dependencies=[Depends(verify_service_token)])
def prepare_download(body: VideoRequest, request: Request) -> dict:
    url = normalize_youtube_url(body.url)
    base_url = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/") or str(request.base_url).rstrip("/")
    token = encode_download_token(url)
    if SANDBOX_DOWNLOADS:
        with job_lock:
            if job["status"] != "idle":
                raise HTTPException(status_code=409, detail="이미 처리 중인 다운로드가 있습니다.")
            job.update(status="processing", url=url)
        threading.Thread(target=run_download_job, args=(url,), daemon=True).start()
        return {
            "downloadUrl": f"{base_url}/v1/download?token={token}",
            "statusUrl": f"{base_url}/v1/status?token={token}",
        }
    safe_info(url)
    return {"downloadUrl": f"{base_url}/v1/download?token={token}"}


def run_download_job(url: str) -> None:
    try:
        safe_info(url)
        directory, file_path = download_file(url)
        with job_lock:
            job.update(status="ready", directory=directory, file_path=file_path)
    except Exception as error:
        with job_lock:
            job.update(status="error", error=error.detail if isinstance(error, HTTPException) else "영상 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.")


def verify_job(token: str) -> None:
    url = decode_download_token(token)
    if not SANDBOX_DOWNLOADS or job.get("url") != url:
        raise HTTPException(status_code=404, detail="다운로드 작업을 찾을 수 없습니다.")


@app.get("/v1/status")
def download_status(token: str) -> dict:
    verify_job(token)
    with job_lock:
        return {"status": job["status"], "error": job.get("error")}


def cleanup_job(directory: Path) -> None:
    shutil.rmtree(directory, ignore_errors=True)
    with job_lock:
        job.update(status="expired")


@app.get("/v1/download")
def download(token: str, background_tasks: BackgroundTasks):
    if SANDBOX_DOWNLOADS:
        verify_job(token)
        with job_lock:
            if job["status"] != "ready":
                raise HTTPException(status_code=409, detail="파일이 준비되지 않았거나 다운로드 주소가 만료되었습니다.")
            directory, file_path = job["directory"], job["file_path"]
            job.update(status="serving")
        background_tasks.add_task(cleanup_job, directory)
        media_type = "video/webm" if file_path.suffix.lower() == ".webm" else "video/mp4"
        return FileResponse(file_path, filename=file_path.name, media_type=media_type, background=background_tasks, headers={"Cache-Control": "private, no-store"})
    url = decode_download_token(token)
    directory, file_path = download_file(url)
    background_tasks.add_task(shutil.rmtree, directory, True)
    media_type = "video/webm" if file_path.suffix.lower() == ".webm" else "video/mp4"
    return FileResponse(file_path, filename=file_path.name, media_type=media_type, background=background_tasks)
