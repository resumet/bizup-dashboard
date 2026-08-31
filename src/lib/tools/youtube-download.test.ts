import assert from "node:assert/strict";
import test from "node:test";

import { formatDuration, parseYoutubeUrl, sanitizeDownloadName } from "./youtube-download";

test("유튜브 영상 URL만 허용하고 영상 ID를 추출한다", () => {
  assert.equal(parseYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").videoId, "dQw4w9WgXcQ");
  assert.equal(parseYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?t=30").videoId, "dQw4w9WgXcQ");
  assert.throws(() => parseYoutubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), /유튜브/u);
  assert.throws(() => parseYoutubeUrl("https://www.youtube.com/playlist?list=abc"), /단일 영상/u);
});

test("다운로드 파일명과 재생 시간을 안전하게 표시한다", () => {
  assert.equal(sanitizeDownloadName("AI: 강의 / 1편?"), "AI_ 강의 _ 1편_");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatDuration(125), "2:05");
});
