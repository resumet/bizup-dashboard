import assert from "node:assert/strict";
import test from "node:test";

import { isMainAdminEmail } from "./access";

test("메인 관리자 이메일은 대소문자와 앞뒤 공백을 무시한다", () => {
  assert.equal(isMainAdminEmail(" RESUMET@gmail.com "), true);
});

test("다른 계정과 빈 값은 관리자로 판단하지 않는다", () => {
  assert.equal(isMainAdminEmail("operator@example.com"), false);
  assert.equal(isMainAdminEmail(undefined), false);
});
