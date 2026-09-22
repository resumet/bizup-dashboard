import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardSchema, updateDashboardSchema } from "./validation";

const metric = {
  metricDate: "2026-09-23",
  googleImpressions: 0,
  metaImpressions: 0,
  googleClicks: 0,
  metaClicks: 0,
  googleAdLeads: 0,
  metaAdLeads: 0,
  googleSpend: 0,
  metaSpend: 0,
  googleLandingLeads: 0,
  metaLandingLeads: 0,
  adminCumulativeLeads: 0,
  organicLeads: {},
};

test("새 광고성과는 저장된 강의 ID와 시작일·예산을 요구한다", () => {
  assert.equal(createDashboardSchema.safeParse({
    courseId: "00000000-0000-4000-8000-000000000003",
    startDate: "2026-09-23",
    totalBudget: 1_000_000,
  }).success, true);
  assert.equal(createDashboardSchema.safeParse({ courseId: "invalid", startDate: "2026-09-23", totalBudget: 0 }).success, false);
});

test("날짜별 지표는 중복되거나 광고 시작일보다 빠를 수 없다", () => {
  assert.equal(updateDashboardSchema.safeParse({ startDate: "2026-09-23", totalBudget: 0, metrics: [metric, metric] }).success, false);
  assert.equal(updateDashboardSchema.safeParse({ startDate: "2026-09-24", totalBudget: 0, metrics: [metric] }).success, false);
  assert.equal(updateDashboardSchema.safeParse({ startDate: "2026-09-23", totalBudget: 0, metrics: [{ ...metric, organicLeads: { invalid: 1 } }] }).success, false);
});
