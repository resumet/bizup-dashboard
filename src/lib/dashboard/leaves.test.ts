import assert from "node:assert/strict";
import test from "node:test";

import { dashboardLeaveItems, shiftDashboardDate } from "./leaves";

test("오늘부터 7일 이내 승인·미승인 휴가를 상태와 날짜 순으로 표시한다", () => {
  const today = "2026-10-30";
  const people = [
    { id: "active-a", name: "가직원", active: true },
    { id: "active-b", name: "나직원", active: true },
    { id: "inactive", name: "퇴직자", active: false },
  ];
  const items = dashboardLeaveItems([
    { id: "today", user_id: "active-b", leave_date: today, unit: "full", status: "approved" },
    { id: "today-pending", user_id: "active-a", leave_date: today, unit: "am", status: "pending" },
    { id: "tomorrow", user_id: "active-a", leave_date: "2026-10-31", unit: "pm", status: "approved" },
    { id: "day-seven", user_id: "active-b", leave_date: "2026-11-06", unit: "full", status: "pending" },
    { id: "day-eight", user_id: "active-a", leave_date: "2026-11-07", unit: "full", status: "approved" },
    { id: "rejected", user_id: "active-a", leave_date: "2026-11-01", unit: "full", status: "rejected" },
    { id: "inactive", user_id: "inactive", leave_date: "2026-11-01", unit: "full", status: "approved" },
  ], people, today);

  assert.deepEqual(items.map(({ id, status, unit, leaveDate }) => ({ id, status, unit, leaveDate })), [
    { id: "today", status: "today", unit: "종일 휴가", leaveDate: "2026-10-30" },
    { id: "today-pending", status: "pending", unit: "오전 반차", leaveDate: "2026-10-30" },
    { id: "tomorrow", status: "upcoming", unit: "오후 반차", leaveDate: "2026-10-31" },
    { id: "day-seven", status: "pending", unit: "종일 휴가", leaveDate: "2026-11-06" },
  ]);
});

test("7일 범위 계산은 월 경계를 넘겨도 날짜 키를 유지한다", () => {
  assert.equal(shiftDashboardDate("2026-10-30", 7), "2026-11-06");
});
