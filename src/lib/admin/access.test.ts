import assert from "node:assert/strict";
import test from "node:test";

import {
  getAccountRole,
  hasAdminAccess,
  isSuperAdminEmail,
  toWorkspaceRole,
} from "./access";

test("최고관리자 이메일은 대소문자와 앞뒤 공백을 무시한다", () => {
  assert.equal(isSuperAdminEmail(" RESUMET@gmail.com "), true);
});

test("다른 계정과 빈 값은 관리자로 판단하지 않는다", () => {
  assert.equal(isSuperAdminEmail("operator@example.com"), false);
  assert.equal(isSuperAdminEmail(undefined), false);
});

test("최고관리자는 이메일로 고정하고 관리자 그룹에는 일반 관리자도 포함한다", () => {
  assert.equal(isSuperAdminEmail("resumet@gmail.com"), true);
  assert.equal(hasAdminAccess("resumet@gmail.com", "operator"), true);
  assert.equal(hasAdminAccess("manager@example.com", "super_admin"), true);
  assert.equal(hasAdminAccess("manager@example.com", "admin"), true);
  assert.equal(hasAdminAccess("user@example.com", "operator"), false);
});

test("계정 권한은 최고관리자, 관리자, 사용자 순서로 판별한다", () => {
  assert.equal(getAccountRole("resumet@gmail.com", ["operator"]), "super_admin");
  assert.equal(getAccountRole("manager@example.com", ["operator", "admin"]), "admin");
  assert.equal(getAccountRole("user@example.com", ["viewer"]), "user");
  assert.equal(toWorkspaceRole("admin"), "admin");
  assert.equal(toWorkspaceRole("user"), "user");
});
