import assert from "node:assert/strict";
import test from "node:test";

import {
  ENROLLMENT_MEMO_MAX_LENGTH,
  parseEnrollmentMemo,
} from "./enrollment-memo";

test("수강생 비고를 공백 제거 후 최대 20글자까지 저장한다", () => {
  assert.equal(parseEnrollmentMemo("  재결제 확인  "), "재결제 확인");
  assert.equal(
    parseEnrollmentMemo("가".repeat(ENROLLMENT_MEMO_MAX_LENGTH)),
    "가".repeat(ENROLLMENT_MEMO_MAX_LENGTH),
  );
  assert.throws(
    () => parseEnrollmentMemo("가".repeat(ENROLLMENT_MEMO_MAX_LENGTH + 1)),
    /최대 20글자/u,
  );
});
