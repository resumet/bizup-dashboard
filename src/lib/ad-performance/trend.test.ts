import assert from "node:assert/strict";
import test from "node:test";
import { adPerformanceTrend } from "./trend";
import type { AdPerformanceDailyMetric } from "./types";

const metric: AdPerformanceDailyMetric = {
  metricDate: "2026-11-22", googleImpressions: 0, metaImpressions: 0,
  googleClicks: 0, metaClicks: 0, googleAdLeads: 20, metaAdLeads: 10,
  googleSpend: 100000, metaSpend: 200000, googleLandingLeads: 5, metaLandingLeads: 10,
  adminCumulativeLeads: 0, chatRoomMembers: 100, organicLeads: { instagram: 99 },
};
test("날짜별 광고 DB 합계와 두 단가는 광고 매체 데이터로 계산하고 톡방 누적값을 그대로 표시한다", () => {
  assert.deepEqual(adPerformanceTrend([metric]), [{ date: "2026-11-22", adLeads: 30, adLeadCost: 10000, landingLeadCost: 20000, chatMembers: 100 }]);
});
test("날짜순으로 정렬하고 분모 0과 미입력 톡방 인원을 0원·0명으로 왜곡하지 않는다", () => {
  const empty = { ...metric, metricDate: "2026-11-21", googleAdLeads: 0, metaAdLeads: 0, googleLandingLeads: 0, metaLandingLeads: 0, chatRoomMembers: null };
  const input = [metric, empty];
  const snapshot = structuredClone(input);
  assert.deepEqual(adPerformanceTrend(input)[0], { date: "2026-11-21", adLeads: 0, adLeadCost: null, landingLeadCost: null, chatMembers: null });
  assert.deepEqual(input, snapshot);
  assert.deepEqual(adPerformanceTrend([]), []);
});
