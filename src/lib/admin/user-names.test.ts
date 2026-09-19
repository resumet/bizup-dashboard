import assert from "node:assert/strict";
import test from "node:test";
import { requireUserDisplayName, resolveUserDisplayNames } from "./user-names";

test("저장 이름이 없으면 최고관리자와 생성 순서대로 기본 사용자 이름을 만든다", () => {
  const names = resolveUserDisplayNames([
    { id: "second", email: "second@example.com", createdAt: "2026-01-02", metadata: {} },
    { id: "super", email: "resumet@gmail.com", createdAt: "2026-01-03", metadata: {} },
    { id: "first", email: "first@example.com", createdAt: "2026-01-01", metadata: {} },
  ]);
  assert.equal(names.get("first"), "사용자1");
  assert.equal(names.get("second"), "사용자2");
  assert.equal(names.get("super"), "최고관리자");
});

test("저장한 사용자 이름을 기본 이름보다 우선하고 입력값을 검증한다", () => {
  const names = resolveUserDisplayNames([
    { id: "user", email: "user@example.com", createdAt: "2026-01-01", metadata: { display_name: " 김민수 " } },
  ]);
  assert.equal(names.get("user"), "김민수");
  assert.equal(requireUserDisplayName(" 새 이름 "), "새 이름");
  assert.throws(() => requireUserDisplayName(" "), /1~30자/);
  assert.throws(() => requireUserDisplayName("가".repeat(31)), /1~30자/);
});
