import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_ACCOUNT_MENU_ITEMS } from "./navigation";

test("관리자 계정 상세 메뉴는 기존 관리자 기능 전체를 제공한다", () => {
  assert.deepEqual(ADMIN_ACCOUNT_MENU_ITEMS, [
    { label: "관리자 설정", href: "/admin" },
    { label: "입출금 장부", href: "/services/cash-ledger" },
    { label: "임직원 관리", href: "/hr/personnel" },
    { label: "비품 관리", href: "/admin/supplies" },
    { label: "캘린더 항목 관리", href: "/admin/calendar" },
    { label: "실험실", href: "/admin/labs" },
  ]);
});
