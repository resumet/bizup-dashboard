import assert from "node:assert/strict";
import test from "node:test";

import {
  createCourseIntakeToken,
  secureStringEqual,
  verifyCourseIntakeToken,
} from "./auth";

test("강의 입력 세션 토큰을 생성하고 만료 전 검증한다", () => {
  const now = Date.UTC(2026, 7, 28, 0, 0, 0);
  const token = createCourseIntakeToken("a".repeat(32), now, 60);
  assert.equal(verifyCourseIntakeToken(token, "a".repeat(32), now + 59_000), true);
  assert.equal(verifyCourseIntakeToken(token, "a".repeat(32), now + 60_000), false);
});

test("변조되거나 다른 비밀키로 서명된 세션 토큰을 거부한다", () => {
  const token = createCourseIntakeToken("a".repeat(32), 1_000, 60);
  assert.equal(verifyCourseIntakeToken(`${token}0`, "a".repeat(32), 2_000), false);
  assert.equal(verifyCourseIntakeToken(token, "b".repeat(32), 2_000), false);
});

test("비밀번호 문자열을 안전하게 비교한다", () => {
  assert.equal(secureStringEqual("correct-password", "correct-password"), true);
  assert.equal(secureStringEqual("wrong", "correct-password"), false);
});
