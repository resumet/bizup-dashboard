"""Hermetic tests: no YouTube requests or actual video downloads."""
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse

os.environ["WORKER_API_TOKEN"] = "test-worker-token"
os.environ["DOWNLOAD_SIGNING_SECRET"] = "test-signing-secret"
os.environ["PUBLIC_BASE_URL"] = "https://sandbox.example"
os.environ["SANDBOX_DOWNLOADS"] = "1"
os.environ["OPENAI_API_KEY"] = "test-openai-key"

from fastapi.testclient import TestClient
from fastapi import HTTPException
import app as worker


def route(url):
    parsed = urlparse(url)
    return f"{parsed.path}?{parsed.query}"


class SandboxTests(unittest.TestCase):
    def setUp(self):
        worker.job.clear()
        worker.job["status"] = "idle"
        self.client = TestClient(worker.app)
        self.headers = {"Authorization": "Bearer test-worker-token"}
        self.body = {"url": "https://youtu.be/jNQXAC9IVRw"}

    def prepare(self):
        response = self.client.post("/v1/downloads", headers=self.headers, json=self.body)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def wait_status(self, prepared):
        for _ in range(100):
            response = self.client.get(route(prepared["statusUrl"]), headers={"Origin": "https://bizup-dashboard.vercel.app"})
            self.assertEqual(response.headers["access-control-allow-origin"], "*")
            if response.json()["status"] != "processing":
                return response.json()
            time.sleep(.01)
        self.fail("job did not finish")

    def test_auth_and_validation(self):
        self.assertEqual(self.client.post("/v1/downloads", json=self.body).status_code, 401)
        self.assertEqual(self.client.post("/v1/downloads", headers=self.headers, json={"url": "https://example.com"}).status_code, 400)
        self.assertEqual(self.client.get("/v1/status?token=invalid").status_code, 401)
        token = worker.encode_download_token("https://youtu.be/jNQXAC9IVRw")
        with patch.object(worker.time, "time", return_value=time.time() + 1300):
            self.assertEqual(self.client.get(f"/v1/status?token={token}").status_code, 401)

    def test_download_status_file_and_cleanup(self):
        with tempfile.TemporaryDirectory(prefix="bizup-test-") as root:
            directory = Path(root) / "job"
            directory.mkdir()
            file_path = directory / "test.mp4"
            file_path.write_bytes(b"test fixture")
            with patch.object(worker, "safe_info", return_value={}), patch.object(worker, "download_file", return_value=(directory, file_path)):
                prepared = self.prepare()
                self.assertEqual(self.wait_status(prepared)["status"], "ready")
                self.assertEqual(self.client.post("/v1/downloads", headers=self.headers, json=self.body).status_code, 409)
                response = self.client.get(route(prepared["downloadUrl"]))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, b"test fixture")
                self.assertIn("attachment", response.headers["content-disposition"])
                self.assertFalse(directory.exists())
                self.assertEqual(self.wait_status(prepared)["status"], "expired")
                self.assertEqual(self.client.get(route(prepared["downloadUrl"])).status_code, 409)

    def test_failed_video_is_reported(self):
        with patch.object(worker, "safe_info", side_effect=HTTPException(status_code=400, detail="공개 영상만 지원합니다.")):
            prepared = self.prepare()
            status = self.wait_status(prepared)
            self.assertEqual(status["status"], "error")
            self.assertEqual(status["error"], "공개 영상만 지원합니다.")

    def test_bundled_ffmpeg_is_usable(self):
        from yt_dlp import YoutubeDL
        from yt_dlp.postprocessor.ffmpeg import FFmpegMergerPP
        options = worker.downloader_options()
        self.assertTrue(Path(options["ffmpeg_location"]).is_file())
        with YoutubeDL(options) as downloader:
            self.assertTrue(FFmpegMergerPP(downloader).available)

    def test_video_upload_transcription_and_result_downloads(self):
        payload = b"test video fixture"
        with tempfile.TemporaryDirectory(prefix="bizup-transcription-test-") as root:
            directory = Path(root) / "job"
            directory.mkdir()

            def finish(_directory, source_path, title):
                self.assertEqual(source_path.read_bytes(), payload)
                audio_path = _directory / "audio.mp3"
                text_path = _directory / "transcript.txt"
                audio_path.write_bytes(b"audio fixture")
                text_path.write_text("테스트 대본", encoding="utf-8-sig")
                with worker.job_lock:
                    worker.job.update(
                        status="ready",
                        title=title,
                        transcript="테스트 대본",
                        audio_path=audio_path,
                        text_path=text_path,
                        audio_filename="test_음성.mp3",
                        text_filename="test_대본.txt",
                    )

            body = {
                "filename": "sample.mp4",
                "size": len(payload),
                "content_type": "video/mp4",
            }
            with patch.object(worker.tempfile, "mkdtemp", return_value=str(directory)), patch.object(worker, "finish_transcription", side_effect=finish):
                prepared_response = self.client.post("/v1/transcriptions/uploads", headers=self.headers, json=body)
                self.assertEqual(prepared_response.status_code, 200)
                prepared = prepared_response.json()
                upload_response = self.client.put(
                    route(prepared["uploadUrl"]),
                    content=payload,
                    headers={"Content-Type": "video/mp4", "Origin": "https://bizup-dashboard.vercel.app"},
                )
                self.assertEqual(upload_response.status_code, 200)
                status = self.wait_status(prepared)
                self.assertEqual(status["status"], "ready")
                self.assertEqual(status["transcript"], "테스트 대본")
                self.assertEqual(self.client.get(route(prepared["audioUrl"])).content, b"audio fixture")
                self.assertIn("테스트 대본".encode(), self.client.get(route(prepared["textUrl"])).content)

    def test_video_upload_validation(self):
        body = {"filename": "sample.exe", "size": 100, "content_type": "application/octet-stream"}
        response = self.client.post("/v1/transcriptions/uploads", headers=self.headers, json=body)
        self.assertEqual(response.status_code, 400)
        self.assertIn("영상만", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
