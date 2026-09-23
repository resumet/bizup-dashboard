import assert from "node:assert/strict";
import test from "node:test";

import { calculateDailyAdSpend, summarizeAdPerformance } from "./calculation";
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

test("광고비는 날짜순으로 누적하고 빈 날짜는 이전 누적액을 유지한다", () => {
  const rows = [
    { ...metric, metricDate: "2026-09-26", googleSpend: 0, metaSpend: 0 },
    { ...metric, metricDate: "2026-09-23" },
    { ...metric, metricDate: "2026-09-25", googleSpend: 100_000, metaSpend: 50_000 },
  ];
  const result = calculateDailyAdSpend(rows);
  assert.deepEqual(result.map(({ metricDate, totalSpend, cumulativeSpend }) => [metricDate, totalSpend, cumulativeSpend]), [
    ["2026-09-23", 500_000, 500_000], ["2026-09-25", 150_000, 650_000], ["2026-09-26", 0, 650_000],
  ]);
  assert.equal(rows[0].metricDate, "2026-09-26");
  assert.equal(result.at(-1)?.cumulativeSpend, summarizeAdPerformance(rows, 0).spend);
  assert.equal(calculateDailyAdSpend(rows.map(row => row.metricDate === "2026-09-23" ? { ...row, googleSpend: 0 } : row)).at(-1)?.cumulativeSpend, 350_000);
  assert.equal(calculateDailyAdSpend(rows.filter(row => row.metricDate !== "2026-09-23")).at(-1)?.cumulativeSpend, 150_000);
  assert.deepEqual(calculateDailyAdSpend([]), []);
});

test("DB당 단가는 매체별 광고비와 해당 접수 건수로 계산한다", () => {
  const [row] = calculateDailyAdSpend([metric]);
  assert.equal(row.googleAdLeadCost, 300_000 / 20);
  assert.equal(row.metaAdLeadCost, 200_000 / 10);
  assert.equal(row.googleLandingLeadCost, 300_000 / 18);
  assert.equal(row.metaLandingLeadCost, 200_000 / 7);
  const [empty] = calculateDailyAdSpend([{ ...metric, googleAdLeads: 0, metaAdLeads: 0, googleLandingLeads: 0, metaLandingLeads: 0 }]);
  assert.deepEqual([empty.googleAdLeadCost, empty.metaAdLeadCost, empty.googleLandingLeadCost, empty.metaLandingLeadCost], [null, null, null, null]);
  assert.equal(calculateDailyAdSpend([{ ...metric, googleSpend: 0 }])[0].googleAdLeadCost, 0);
});

test("매체별 누적광고비 합계는 전체 누적광고비와 일치한다", () => {
  const result = summarizeAdPerformance([metric, { ...metric, metricDate: "2026-09-24", googleSpend: 100_000, metaSpend: 50_000 }], 0);
  assert.equal(result.googleSpend, 400_000);
  assert.equal(result.metaSpend, 250_000);
  assert.equal(result.spend, result.googleSpend + result.metaSpend);
  const empty = summarizeAdPerformance([], 0);
  assert.equal(empty.googleSpend, 0);
  assert.equal(empty.metaSpend, 0);
});

test("Google과 Meta 광고 원시값을 합산해 핵심 성과를 계산한다", () => {
  const result = summarizeAdPerformance([metric], 1_000_000);
  assert.equal(result.impressions, 10_000);
  assert.equal(result.clicks, 300);
  assert.equal(result.adLeads, 30);
  assert.equal(result.spend, 500_000);
  assert.equal(result.googleSpend, 300_000);
  assert.equal(result.metaSpend, 200_000);
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
