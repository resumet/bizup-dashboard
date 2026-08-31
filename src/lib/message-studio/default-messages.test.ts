import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MESSAGE_TEMPLATES } from "./default-messages";

test("신규 강의에 사용할 기본 문자 리소스가 30개 준비되어 있다", () => {
  assert.equal(DEFAULT_MESSAGE_TEMPLATES.length, 30);
  assert.ok(
    DEFAULT_MESSAGE_TEMPLATES.every((message) => message.trim().length > 0),
  );
  assert.match(DEFAULT_MESSAGE_TEMPLATES[0], /무료특강 곧 시작합니다/);
  assert.match(DEFAULT_MESSAGE_TEMPLATES[29], /얼리버드 오늘 마감/);
  assert.ok(
    DEFAULT_MESSAGE_TEMPLATES.some((message) => message.includes("🎁")),
  );
});
