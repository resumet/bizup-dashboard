import assert from "node:assert/strict";
import test from "node:test";

import {
  formatReleaseAssetLabel,
  formatReleaseAssetSize,
  parseYouTubeLiveRecorderRelease,
} from "./youtube-live-recorder-release";

test("최신 릴리즈에서 설치 파일만 다운로드 대상으로 만든다", () => {
  const release = parseYouTubeLiveRecorderRelease({
    name: "YouTube Live Recorder 1.0.0",
    tag_name: "v1.0.0",
    published_at: "2026-10-25T04:59:30Z",
    html_url: "https://github.com/example/releases/tag/v1.0.0",
    assets: [
      {
        name: "YouTubeLiveRecorder-1.0.0-Setup.exe",
        browser_download_url: "https://github.com/example/recorder.exe",
        size: 181_307_695,
      },
      {
        name: "release.json",
        browser_download_url: "https://github.com/example/release.json",
        size: 365,
      },
      {
        name: "YouTubeLiveRecorder-1.0.0-Setup.exe.sha256",
        browser_download_url: "https://github.com/example/recorder.exe.sha256",
        size: 103,
      },
    ],
  });

  assert.equal(release?.version, "v1.0.0");
  assert.deepEqual(release?.assets.map(({ name }) => name), [
    "YouTubeLiveRecorder-1.0.0-Setup.exe",
  ]);
  assert.equal(formatReleaseAssetSize(release?.assets[0]?.size ?? 0), "173MB");
  assert.equal(
    formatReleaseAssetLabel(release?.assets[0]?.name ?? ""),
    "Windows 다운로드",
  );
});

test("필수 릴리즈 정보가 없으면 표시하지 않는다", () => {
  assert.equal(parseYouTubeLiveRecorderRelease({ tag_name: "v1.0.0" }), null);
});
