import assert from "node:assert/strict";
import test from "node:test";

import { annualLeaveDays, leaveBalance, supportEarnedDays } from "./policy";

test("입사월을 포함해 연말까지 월 1개의 기본 휴가를 부여한다", () => {
  assert.equal(annualLeaveDays("2026-01-31", 2026), 12);
  assert.equal(annualLeaveDays("2026-09-21", 2026), 4);
  assert.equal(annualLeaveDays("2026-12-31", 2026), 1);
  assert.equal(annualLeaveDays("2025-12-31", 2026), 12);
  assert.equal(annualLeaveDays("2027-01-01", 2026), 0);
});

test("지원근무 종류와 시간에 따라 추가휴가를 별도로 계산한다", () => {
  assert.equal(supportEarnedDays("night_webinar", "half"), 0.5);
  assert.equal(supportEarnedDays("weekend_holiday", "half"), 0.5);
  assert.equal(supportEarnedDays("weekend_holiday", "full"), 1);
});

test("기본·추가 휴가와 승인·대기 사용량을 분리해 잔여량을 계산한다", () => {
  const balance = leaveBalance(
    12,
    [
      { days: 1, status: "approved" },
      { days: 0.5, status: "pending" },
      { days: 1, status: "rejected" },
    ],
    [
      { earned_days: 0.5, status: "approved" },
      { earned_days: 1, status: "pending" },
    ],
  );
  assert.deepEqual(balance, {
    baseGranted: 12,
    extraGranted: 0.5,
    used: 1,
    pending: 0.5,
    remaining: 11.5,
    availableToRequest: 11,
  });
});
