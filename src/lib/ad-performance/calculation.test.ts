import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAdPerformance } from "./calculation";
import type { AdPerformanceDailyMetric } from "./types";

const metric: AdPerformanceDailyMetric = {
  metricDate: "2026-09-23",
  googleImpressions: 8_000,
  metaImpressions: 2_000,
  googleClicks: 200,
  metaClicks: 100,
  googleAdLeads: 20,
  metaAdLeads: 10,
  googleSpend: 300_000,
  metaSpend: 200_000,
  googleLandingLeads: 18,
  metaLandingLeads: 7,
  adminCumulativeLeads: 28,
  organicLeads: { blog: 5, youtube: 3 },
};

test("Google과 Meta 광고 원시값을 합산해 핵심 성과를 계산한다", () => {
  const result = summarizeAdPerformance([metric], 1_000_000);
  assert.equal(result.impressions, 10_000);
  assert.equal(result.clicks, 300);
  assert.equal(result.adLeads, 30);
  assert.equal(result.spend, 500_000);
  assert.equal(result.remainingBudget, 500_000);
  assert.equal(result.googleClickConversionRate, 2.5);
  assert.equal(result.metaClickConversionRate, 5);
  assert.equal(result.googleLandingConversionRate, 10);
  assert.equal(result.metaLandingConversionRate, 10);
  assert.equal(result.adLeadCost, 500_000 / 30);
  assert.equal(result.paidLandingLeadCost, 20_000);
  assert.equal(result.paidLandingLeads, 25);
  assert.equal(result.organicLandingLeads, 8);
  assert.equal(result.totalDatabaseLeads, 33);
  assert.equal(result.adminCumulativeLeads, 28);
});

test("분모가 없는 전환율과 단가는 null로 반환한다", () => {
  const empty: AdPerformanceDailyMetric = {
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
  const result = summarizeAdPerformance([empty], 0);
  assert.equal(result.googleClickConversionRate, null);
  assert.equal(result.metaClickConversionRate, null);
  assert.equal(result.googleLandingConversionRate, null);
  assert.equal(result.metaLandingConversionRate, null);
  assert.equal(result.adLeadCost, null);
  assert.equal(result.paidLandingLeadCost, null);
});

test("어드민 누적 DB는 날짜가 가장 최신인 직접 입력값을 사용한다", () => {
  const older = { ...metric, metricDate: "2026-09-22", adminCumulativeLeads: 20 };
  assert.equal(summarizeAdPerformance([metric, older], 0).adminCumulativeLeads, 28);
});
