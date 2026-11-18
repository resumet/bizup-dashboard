import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCreativeMedia } from "./media-summary";
import type { CreativeRow } from "./model";

const row: CreativeRow = {
  platform: "meta", date: "2026-11-17", ad: "소재A", webinar: "김선아웨비나", instructor: "",
  campaign: "", group: "", status: "", adType: "", cost: 100, impressions: 40, clicks: 2, conversions: 0.5,
};

test("소재 수는 매체 안에서 중복을 제거하고 합계 단가와 비율은 전체 분모로 계산한다", () => {
  const [meta, google, total] = summarizeCreativeMedia([
    row, { ...row, date: "2026-11-18" },
    { ...row, platform: "google", cost: 800, impressions: 120, clicks: 6, conversions: 3 },
  ]);
  assert.equal(meta.creatives, 1);
  assert.equal(google.creatives, 1);
  assert.deepEqual(total, { label: "합계", creatives: 2, cost: 1000, impressions: 200, clicks: 10,
    leads: 4, cpl: 250, cpm: 5000, ctr: 0.05, cpc: 100, conversionRate: 0.4 });
});

test("빈 매체와 분모가 0인 지표는 원본 시트처럼 0을 표시한다", () => {
  const [meta, google] = summarizeCreativeMedia([{ ...row, impressions: null, clicks: 0, conversions: null }]);
  assert.equal(google.creatives, 0);
  for (const item of [meta, google]) assert.deepEqual([item.cpl, item.cpm, item.ctr, item.cpc, item.conversionRate], [0, 0, 0, 0, 0]);
});
