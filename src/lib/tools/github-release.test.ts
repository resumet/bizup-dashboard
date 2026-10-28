import assert from "node:assert/strict";
import test from "node:test";

import {
  formatReleaseAssetLabel,
  formatReleaseAssetSize,
  getGitHubReleasesUrl,
  parseGitHubLatestRelease,
} from "./github-release";

test("최신 릴리즈에서 실제 설치 파일만 다운로드 대상으로 만든다", () => {
  const release = parseGitHubLatestRelease({
    name: "KakoMVP v1.23",
    tag_name: "v1.23",
    published_at: "2026-10-25T03:47:57Z",
    html_url: "https://github.com/example/releases/tag/v1.23",
    assets: [
      {
        name: "KakoMVP-v1.23.exe",
        browser_download_url: "https://github.com/example/KakoMVP-v1.23.exe",
        size: 5_434_880,
      },
      {
        name: "KakoMVP-v1.23.exe.sha256.txt",
        browser_download_url:
          "https://github.com/example/KakoMVP-v1.23.exe.sha256.txt",
        size: 83,
      },
      {
        name: "release.json",
        browser_download_url: "https://github.com/example/release.json",
        size: 365,
      },
    ],
  });

  assert.equal(release?.version, "v1.23");
  assert.deepEqual(release?.assets.map(({ name }) => name), [
    "KakoMVP-v1.23.exe",
  ]);
  assert.equal(formatReleaseAssetSize(release?.assets[0]?.size ?? 0), "5.2MB");
  assert.equal(
    formatReleaseAssetLabel(release?.assets[0]?.name ?? ""),
    "Windows 다운로드",
  );
});

test("저장소 설정으로 릴리즈 목록 주소를 만들고 필수 정보 누락을 거부한다", () => {
  assert.equal(
    getGitHubReleasesUrl({
      owner: "resumet",
      repository: "kakao-opentalk-manager",
      cacheTag: "kakao-opentalk-manager-release",
    }),
    "https://github.com/resumet/kakao-opentalk-manager/releases",
  );
  assert.equal(parseGitHubLatestRelease({ tag_name: "v1.23" }), null);
});
