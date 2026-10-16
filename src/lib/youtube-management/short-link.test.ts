import assert from "node:assert/strict";
import test from "node:test";
import { parseYoutubeShortPathCode, youtubeShortPath } from "./short-link";

test("유튜브 공개 유형별 단축 경로를 만들고 해석한다", () => {
  const code = "AbCdEf0123_-xyZ9";
  assert.equal(youtubeShortPath("schedule", code), `/y/s-${code}`);
  assert.equal(youtubeShortPath("brief", code), `/y/b-${code}`);
  assert.deepEqual(parseYoutubeShortPathCode(`s-${code}`), { kind: "schedule", shortCode: code });
  assert.deepEqual(parseYoutubeShortPathCode(`b-${code}`), { kind: "brief", shortCode: code });
});

test("길이와 URL 안전 문자 규칙에 맞지 않는 단축 코드는 거부한다", () => {
  assert.equal(youtubeShortPath("schedule", "too-short"), null);
  assert.equal(parseYoutubeShortPathCode("s-AbCdEf0123+/xyZ9"), null);
  assert.equal(parseYoutubeShortPathCode("x-AbCdEf0123_-xyZ9"), null);
});
