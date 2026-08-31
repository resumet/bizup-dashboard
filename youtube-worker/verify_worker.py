import os
from urllib.parse import urlparse

from fastapi.testclient import TestClient

os.environ.setdefault("WORKER_API_TOKEN", "verification-worker-token")
os.environ.setdefault("DOWNLOAD_SIGNING_SECRET", "verification-signing-secret-at-least-32-bytes")
os.environ.setdefault("PUBLIC_BASE_URL", "https://worker.example")

from app import app  # noqa: E402


def main() -> None:
    source_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    headers = {"Authorization": "Bearer verification-worker-token"}
    with TestClient(app) as client:
        assert client.get("/health").json() == {"ok": True}
        assert client.post("/v1/info", json={"url": source_url}).status_code == 401

        info_response = client.post("/v1/info", headers=headers, json={"url": source_url})
        info_response.raise_for_status()
        assert info_response.json()["info"]["id"] == "jNQXAC9IVRw"

        prepared = client.post("/v1/downloads", headers=headers, json={"url": source_url})
        prepared.raise_for_status()
        download_url = prepared.json()["downloadUrl"]
        parsed = urlparse(download_url)
        downloaded = client.get(f"{parsed.path}?{parsed.query}")
        downloaded.raise_for_status()
        assert downloaded.headers["content-type"].startswith("video/")
        assert len(downloaded.content) > 100_000

        print({"videoId": "jNQXAC9IVRw", "bytes": len(downloaded.content)})


if __name__ == "__main__":
    main()
