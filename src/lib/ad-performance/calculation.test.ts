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
  landingLeads: 25,
  googleAdminLeads: 19,
  metaAdminLeads: 9,
};

test("Google과 Meta 광고 원시값을 합산해 핵심 성과를 계산한다", () => {
  const result = summarizeAdPerformance([metric], 1_000_000);
  assert.equal(result.impressions, 10_000);
  assert.equal(result.clicks, 300);
  assert.equal(result.adLeads, 30);
  assert.equal(result.spend, 500_000);
  assert.equal(result.remainingBudget, 500_000);
  assert.equal(result.clickThroughRate, 3);
  assert.equal(result.landingConversionRate, 25 / 300 * 100);
  assert.equal(result.adLeadCost, 500_000 / 30);
  assert.equal(result.landingLeadCost, 20_000);
  assert.equal(result.adminLeads, 28);
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
    landingLeads: 0,
    googleAdminLeads: 0,
    metaAdminLeads: 0,
  };
  const result = summarizeAdPerformance([empty], 0);
  assert.equal(result.clickThroughRate, null);
  assert.equal(result.landingConversionRate, null);
  assert.equal(result.adLeadCost, null);
  assert.equal(result.landingLeadCost, null);
});
