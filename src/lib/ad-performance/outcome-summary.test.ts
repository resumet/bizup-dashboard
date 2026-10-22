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
  assert.match(text, /광고비 대비 15배/u);
});

test("요청한 미닝 예시에서 단계별 전환율과 광고비 대비 매출 배수를 계산한다", () => {
  const text = adPerformanceOutcomeSummary([
    { ...metric, googleSpend: 850572, metaSpend: 29123909, googleLandingLeads: 2000, metaLandingLeads: 347, organicLeads: {} },
  ], { ad_spend: 1, group_chat_count: 2040, live_peak_count: 486, payment_count: 44, revenue: 118260000 });
  assert.equal(text, "광고비 29,974,481원을 집행했습니다. DB는 총 2,347건 접수되었고, 톡방에는 2,040명 (DB 대비 86.9%)이 입장했습니다. 라이브에는 최대 486명 (DB 대비 20.7%, 톡방 대비 23.8%)이 참여했고, 결제는 44건 (DB 대비 1.9%, 톡방 대비 2.2%, 라이브 대비 9.1%) 이루어졌으며, 총 118,260,000원 (광고비 대비 3.95배)의 매출을 기록했습니다.");
});

test("분모가 0이거나 미입력이면 계산 불가를 표시하고 실제 0건은 0%로 표시한다", () => {
  const zeroBase = adPerformanceOutcomeSummary([
    { ...metric, googleSpend: 0, metaSpend: 0, googleLandingLeads: 0, metaLandingLeads: 0, organicLeads: {} },
  ], { ad_spend: 0, group_chat_count: 0, live_peak_count: 0, payment_count: 0, revenue: 0 });
  assert.match(zeroBase, /DB 대비 계산 불가/u);
  assert.match(zeroBase, /톡방 대비 계산 불가/u);
  assert.match(zeroBase, /라이브 대비 계산 불가/u);
  assert.match(zeroBase, /광고비 대비 계산 불가/u);
  assert.doesNotMatch(zeroBase, /NaN|Infinity/u);
  const zeroPayment = adPerformanceOutcomeSummary([metric], { ad_spend: 0, group_chat_count: 20, live_peak_count: 10, payment_count: 0, revenue: 0 });
  assert.match(zeroPayment, /결제는 0건 \(DB 대비 0%, 톡방 대비 0%, 라이브 대비 0%\)/u);
  const missingBase = adPerformanceOutcomeSummary([], { ad_spend: 100000, group_chat_count: null, live_peak_count: null, payment_count: 1, revenue: 200000 });
  assert.match(missingBase, /DB 대비 계산 불가, 톡방 대비 계산 불가, 라이브 대비 계산 불가/u);
  assert.match(missingBase, /광고비 대비 2배/u);
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
