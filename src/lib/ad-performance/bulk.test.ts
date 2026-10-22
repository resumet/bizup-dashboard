import assert from "node:assert/strict";
import test from "node:test";
import { bulkComparisonNarrative, bulkMetricDefinitions, bulkValues, compareBulkMetric, formatBulkValue, type AdPerformanceBulkRow, type BulkMetricKey } from "./bulk";
import { getAdPerformanceOutcome } from "./outcome-summary";
import type { AdPerformanceDailyMetric } from "./types";

const metric: AdPerformanceDailyMetric = { metricDate: "2026-10-01", googleImpressions: 0, metaImpressions: 0, googleClicks: 0, metaClicks: 0,
  googleAdLeads: 4, metaAdLeads: 1977, googleSpend: 850572, metaSpend: 29123909, googleLandingLeads: 1000, metaLandingLeads: 1000,
  adminCumulativeLeads: 0, chatRoomMembers: 1931, organicLeads: { insta: 7, youtube: 200, extra: 47, unknown: 93 } };
const channels = [{ id: "insta", name: "인스타", sortOrder: 0 }, { id: "unknown", name: "경로불명", sortOrder: 1 }];
const webinar = { ad_spend: 1, group_chat_count: 2040, live_peak_count: 486, payment_count: 44, revenue: 118260000 };
const definition = (key: BulkMetricKey) => bulkMetricDefinitions.find((item) => item.key === key)!;

test("일괄·단계별 카드는 요약과 같은 DB 분모·웨비나 실적 및 유튜브 잔여 유입을 사용한다", () => {
  const values = bulkValues([metric], 30000000, channels, webinar);
  assert.equal(values.databaseLeads, 2347);
  assert.equal(values.youtube, 247);
  assert.equal(values.instagram, 7);
  assert.equal(values.organicLandingLeads, 347);
  assert.equal(values.googleLeadCost, 212643);
  assert.equal(values.latestChatRoomMembers, 1931);
  assert.equal(values.chatMembers, 2040);
  assert.equal(formatBulkValue(values.chatToDb, "%"), "86.9%");
  assert.equal(formatBulkValue(values.revenueMultiple, "배"), "3.95배");
  assert.equal(values.paymentToLive, getAdPerformanceOutcome([metric], webinar).paymentToLive);
});

test("실제 0과 미입력을 구별하고 0 분모를 계산하지 않는다", () => {
  const missing = bulkValues([], 0, [], null);
  for (const key of ["spend", "databaseLeads", "latestChatRoomMembers", "payments", "revenue", "googleSpend", "youtube"] as const) assert.equal(missing[key], null);
  const zero = bulkValues([{ ...metric, googleSpend: 0, metaSpend: 0, googleAdLeads: 0, metaAdLeads: 0, chatRoomMembers: null }], 0, channels, { ...webinar, payment_count: 0, revenue: 0 });
  assert.equal(zero.spend, 0);
  assert.equal(zero.payments, 0);
  assert.equal(zero.paymentToDb, 0);
  assert.equal(zero.revenueMultiple, null);
  assert.equal(zero.budgetRate, null);
  assert.equal(zero.latestChatRoomMembers, null);
  assert.equal(formatBulkValue(null, "%"), "—");
});

test("낮은 단가와 높은 전환율을 개선으로 판정하고 광고비는 중립 변화로 처리한다", () => {
  assert.equal(compareBulkMetric(definition("adLeadCost"), 100, 80).status, "improved");
  assert.equal(compareBulkMetric(definition("adLeadCost"), 80, 100).status, "weakened");
  assert.equal(compareBulkMetric(definition("paymentToDb"), 1, 2).label, "개선 +1%p");
  assert.equal(compareBulkMetric(definition("spend"), 100, 80).status, "neutral");
  assert.equal(compareBulkMetric(definition("payments"), null, 0).status, "missing");
  assert.equal(compareBulkMetric(definition("adLeadCost"), 100.1, 100.2).status, "same");
  assert.equal(compareBulkMetric(definition("payments"), 0, 1).label, "개선 +1명");
});

test("분석 문장은 비교 방향·절대 변화·누적 기간을 표시하고 미입력을 실적으로 해석하지 않는다", () => {
  const values = bulkValues([metric], 30000000, channels, webinar);
  const left: AdPerformanceBulkRow = { id: "a", name: "기준 강의", instructorName: "강사", href: "/a", startDate: "2026-10-01", endDate: "2026-10-10", values };
  const right = { ...left, id: "b", name: "비교 강의", values: { ...values, spend: 100000, payments: null, adLeadCost: 1000 } };
  const text = bulkComparisonNarrative(left, right).join(" ");
  assert.match(text, /기준 강의 대비 비교 강의/u);
  assert.match(text, /집행 규모 변화/u);
  assert.match(text, /결제 인원 지표는 입력값이 부족/u);
  assert.match(text, /집계 기간은 기준 2026-10-01 ~ 2026-10-10/u);
  assert.doesNotMatch(text, /NaN|Infinity/u);
  assert.equal(compareBulkMetric(definition("adLeadCost"), right.values.adLeadCost, left.values.adLeadCost).status, "weakened");
});
