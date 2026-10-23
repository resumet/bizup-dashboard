import assert from "node:assert/strict";
import test from "node:test";

import { buildExternalMarketingReportRows, buildExternalMarketingReportTotalRow } from "./report";

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
  assert.equal(row.landingReceptionDb, 20);
  assert.equal(row.chatRoomEntrants, null);
  assert.equal(row.chatRoomCumulative, 30);
  assert.equal(row.adDbUnitCost, 20_000);
  assert.equal(row.landingReceptionDbUnitCost, 10_000);
});

test("단톡방 입장은 전날 누적인원과의 차이로 계산한다", () => {
  const rows = buildExternalMarketingReportRows([
    {
      metricDate: "2026-10-20", googleImpressions: 0, metaImpressions: 0,
      googleClicks: 0, metaClicks: 0, googleAdLeads: 0, metaAdLeads: 0,
      googleSpend: 0, metaSpend: 0, googleLandingLeads: 0, metaLandingLeads: 0,
      adminCumulativeLeads: 0, chatRoomMembers: 30, organicLeads: {},
    },
    {
      metricDate: "2026-10-21", googleImpressions: 0, metaImpressions: 0,
      googleClicks: 0, metaClicks: 0, googleAdLeads: 0, metaAdLeads: 0,
      googleSpend: 0, metaSpend: 0, googleLandingLeads: 7, metaLandingLeads: 3,
      adminCumulativeLeads: 0, chatRoomMembers: 42, organicLeads: {},
    },
  ]);
  assert.equal(rows[1].landingReceptionDb, 10);
  assert.equal(rows[1].chatRoomEntrants, 12);
  assert.equal(rows[1].chatRoomCumulative, 42);
});

test("전체 행은 합계 분모로 전환율과 단가를 다시 계산한다", () => {
  const total = buildExternalMarketingReportTotalRow([
    {
      metricDate: "2026-10-20", googleImpressions: 100, metaImpressions: 100,
      googleClicks: 10, metaClicks: 10, googleAdLeads: 1, metaAdLeads: 1,
      googleSpend: 30_000, metaSpend: 20_000, googleLandingLeads: 3, metaLandingLeads: 2,
      adminCumulativeLeads: 0, chatRoomMembers: 10, organicLeads: {},
    },
    {
      metricDate: "2026-10-21", googleImpressions: 300, metaImpressions: 500,
      googleClicks: 30, metaClicks: 50, googleAdLeads: 3, metaAdLeads: 5,
      googleSpend: 70_000, metaSpend: 80_000, googleLandingLeads: 7, metaLandingLeads: 8,
      adminCumulativeLeads: 0, chatRoomMembers: 25, organicLeads: {},
    },
  ]);
  assert.equal(total.metricDate, "전체");
  assert.equal(total.impressions, 1_000);
  assert.equal(total.clicks, 100);
  assert.equal(total.clickConversionRate, 10);
  assert.equal(total.landingReceptionDb, 20);
  assert.equal(total.landingConversionRate, 20);
  assert.equal(total.spend, 200_000);
  assert.equal(total.chatRoomEntrants, 15);
  assert.equal(total.chatRoomCumulative, 25);
  assert.equal(total.adDbUnitCost, 20_000);
  assert.equal(total.landingReceptionDbUnitCost, 10_000);
  assert.equal(total.chatReceptionDbUnitCost, 8_000);
});
