import assert from "node:assert/strict";
import test from "node:test";
import { adPerformanceOutcomeSummary } from "./outcome-summary";
import type { AdPerformanceDailyMetric } from "./types";

const metric: AdPerformanceDailyMetric = {
  metricDate: "2026-10-01", googleImpressions: 0, metaImpressions: 0,
  googleClicks: 0, metaClicks: 0, googleAdLeads: 20, metaAdLeads: 10,
  googleSpend: 60000, metaSpend: 40000, googleLandingLeads: 15, metaLandingLeads: 5,
  adminCumulativeLeads: 0, chatRoomMembers: 18, organicLeads: { blog: 3 },
};

test("광고 접수와 오가닉 DB를 합치고 연결된 라이브 웨비나 성과로 요약한다", () => {
  const text = adPerformanceOutcomeSummary([metric], { ad_spend: 90000, group_chat_count: 21, live_peak_count: 17, payment_count: 5, revenue: 1500000 });
  assert.match(text, /광고비 100,000원/u);
  assert.match(text, /DB는 총 23건/u);
  assert.match(text, /톡방에는 21명/u);
  assert.match(text, /최대 17명/u);
  assert.match(text, /결제는 5건/u);
  assert.match(text, /1,500,000원/u);
});

test("미입력 웨비나 실적은 0으로 꾸미지 않고 톡방은 최신 입력을 사용한다", () => {
  const text = adPerformanceOutcomeSummary([
    { ...metric, metricDate: "2026-10-03", chatRoomMembers: null },
    metric,
    { ...metric, metricDate: "2026-10-02", chatRoomMembers: 25 },
  ], null);
  assert.match(text, /톡방에는 25명/u);
  assert.match(text, /라이브 최대 인원은 미입력/u);
  assert.match(text, /결제 건수는 미입력/u);
  assert.match(text, /매출은 미입력/u);
  const zero = adPerformanceOutcomeSummary([], { ad_spend: 0, group_chat_count: 0, live_peak_count: 0, payment_count: 0, revenue: 0 });
  assert.match(zero, /광고비 0원/u);
  assert.match(zero, /톡방에는 0명/u);
  assert.match(zero, /결제는 0건/u);
  assert.match(zero, /접수 DB는 미입력/u);
});
