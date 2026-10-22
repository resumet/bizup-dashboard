import assert from "node:assert/strict";
import test from "node:test";

import { buildExternalMarketingReportRows } from "./report";

test("외부 공개 보고서의 합계, 전환율, 단가를 계산한다", () => {
  const [row] = buildExternalMarketingReportRows([{
    metricDate: "2026-10-20",
    googleImpressions: 600,
    metaImpressions: 400,
    googleClicks: 60,
    metaClicks: 40,
    googleAdLeads: 6,
    metaAdLeads: 4,
    googleSpend: 120_000,
    metaSpend: 80_000,
    googleLandingLeads: 12,
    metaLandingLeads: 8,
    adminCumulativeLeads: 0,
    chatRoomMembers: 30,
    organicLeads: {},
  }]);
  assert.equal(row.impressions, 1_000);
  assert.equal(row.clicks, 100);
  assert.equal(row.clickConversionRate, 10);
  assert.equal(row.landingConversionRate, 20);
  assert.equal(row.adDbUnitCost, 20_000);
  assert.equal(row.landingReceptionDbUnitCost, 10_000);
});
