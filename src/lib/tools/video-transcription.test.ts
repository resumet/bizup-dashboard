import assert from "node:assert/strict";
import test from "node:test";

import {
  formatFileSize,
  MAX_TRANSCRIPTION_VIDEO_BYTES,
  sanitizeYoutubeCookies,
  validateVideoUpload,
} from "./video-transcription";

test("지원하는 영상 파일과 최대 크기를 검증한다", () => {
  assert.deepEqual(
    validateVideoUpload({ filename: "강의.MP4", size: 1024, contentType: "video/mp4" }),
    { filename: "강의.MP4", size: 1024, contentType: "video/mp4" },
  );
  assert.throws(
    () => validateVideoUpload({ filename: "audio.mp3", size: 1024, contentType: "audio/mpeg" }),
    /영상만/u,
  );
  assert.throws(
    () => validateVideoUpload({ filename: "video.mp4", size: MAX_TRANSCRIPTION_VIDEO_BYTES + 1 }),
    /500MB/u,
  );
});

test("파일 크기를 읽기 쉽게 표시한다", () => {
  assert.equal(formatFileSize(1024), "1KB");
  assert.equal(formatFileSize(12.5 * 1024 * 1024), "12.5MB");
});

test("YouTube cookies.txt에서 YouTube 도메인 쿠키만 남긴다", () => {
  const sanitized = sanitizeYoutubeCookies([
    "# Netscape HTTP Cookie File",
    ".youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tyoutube-secret",
    "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\thttp-only-secret",
    ".google.com\tTRUE\t/\tTRUE\t0\tSID\tgoogle-secret",
  ].join("\n"));

  assert.match(sanitized, /youtube-secret/u);
  assert.match(sanitized, /http-only-secret/u);
  assert.doesNotMatch(sanitized, /google-secret/u);
  assert.throws(() => sanitizeYoutubeCookies("# Netscape HTTP Cookie File"), /YouTube 도메인/u);
});
