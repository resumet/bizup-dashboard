import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

app = FastAPI(title="BizUp YouTube Download Worker", docs_url=None, redoc_url=None)

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


class VideoRequest(BaseModel):
    url: str


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
        with YoutubeDL({"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True}) as ydl:
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
    payload = json.dumps({"url": url, "exp": int(time.time()) + 600}, separators=(",", ":")).encode()
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


def download_file(url: str) -> tuple[Path, Path]:
    directory = Path(tempfile.mkdtemp(prefix="bizup-youtube-"))
    output = str(directory / "%(title).120B.%(ext)s")
    try:
        with YoutubeDL({
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


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/v1/info", dependencies=[Depends(verify_service_token)])
def video_info(body: VideoRequest) -> dict:
    url = normalize_youtube_url(body.url)
    return {"info": public_info(safe_info(url))}


@app.post("/v1/downloads", dependencies=[Depends(verify_service_token)])
def prepare_download(body: VideoRequest, request: Request) -> dict:
    url = normalize_youtube_url(body.url)
    safe_info(url)
    base_url = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/") or str(request.base_url).rstrip("/")
    return {"downloadUrl": f"{base_url}/v1/download?token={encode_download_token(url)}"}


@app.get("/v1/download")
def download(token: str, background_tasks: BackgroundTasks):
    url = decode_download_token(token)
    directory, file_path = download_file(url)
    background_tasks.add_task(shutil.rmtree, directory, True)
    media_type = "video/webm" if file_path.suffix.lower() == ".webm" else "video/mp4"
    return FileResponse(file_path, filename=file_path.name, media_type=media_type, background=background_tasks)
