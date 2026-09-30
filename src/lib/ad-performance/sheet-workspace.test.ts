import assert from "node:assert/strict";
import test from "node:test";

import type { MeaningTrackingImport } from "@/lib/admin/meaning-tracking";
import {
  buildAdPerformanceMetricSnapshot,
  canonicalGoogleSpreadsheetUrl,
  currentSeoulDate,
  extractGoogleSpreadsheetId,
  filterAdPerformanceSourceRowsBeforeDate,
  normalizeAdPerformanceSourceRows,
  resolveAdPerformanceSourceDate,
} from "./sheet-workspace";

const spreadsheetId = "1tV5C6o_MBrX2UIp26fFJ-rXV2p3sFyorGZx_IVg8_4c";

test("Google Sheets URL만 허용하고 문서 ID를 추출한다", () => {
  assert.equal(
    extractGoogleSpreadsheetId(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=730841671#gid=730841671`,
    ),
    spreadsheetId,
  );
  assert.equal(
    canonicalGoogleSpreadsheetUrl(spreadsheetId),
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  );
  assert.throws(
    () => extractGoogleSpreadsheetId("https://example.com/spreadsheets/d/not-google"),
    /docs.google.com/,
  );
});

test("원본 시트는 A:N까지만 정규화하고 빈 마지막 행을 제거한다", () => {
  const rows = normalizeAdPerformanceSourceRows([
    Array.from({ length: 16 }, (_, index) => `열${index + 1}`),
    ["9월24일", 100],
    [],
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 14);
  assert.equal(rows[0][13], "열14");
  assert.equal(rows[1][1], "100");
  assert.equal(rows[1][13], "");
});

test("연도 없는 날짜는 대시보드 시작일과 가장 가까운 연도로 결정한다", () => {
  assert.equal(
    resolveAdPerformanceSourceDate("12월31일", "2027-01-02"),
    "2026-12-31",
  );
  assert.equal(
    resolveAdPerformanceSourceDate("2026. 9. 30", "2026-09-01"),
    "2026-09-30",
  );
});

test("서울 기준 오늘 이전 날짜의 Google 시트 행만 유지한다", () => {
  const rows = filterAdPerformanceSourceRowsBeforeDate(
    [
      ["미닝웨비나", "총광고비"],
      ["", ""],
      ["9월29일", "100"],
      ["9월30일", "200"],
      ["10월1일", "300"],
      ["합계", "600"],
    ],
    "2026-09-01",
    "2026-09-30",
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[2][0], "9월29일");
});

test("UTC 날짜가 바뀌기 전에도 서울 날짜를 기준으로 오늘을 계산한다", () => {
  assert.equal(
    currentSeoulDate(new Date("2026-09-29T14:59:59.999Z")),
    "2026-09-29",
  );
  assert.equal(
    currentSeoulDate(new Date("2026-09-29T15:00:00.000Z")),
    "2026-09-30",
  );
});

test("원본·유입 엑셀·수기 입력을 날짜별 DB 지표로 합친다", () => {
  const sourceRows = normalizeAdPerformanceSourceRows([
    ["미닝웨비나", "총광고비", "광고 노출", "", "광고 클릭", "", "", "", "", "", "광고집행비용", "", "광고접수DB", ""],
    ["", "", "구글광고", "메타광고", "구글광고", "메타광고", "", "", "", "", "구글광고", "메타광고", "구글광고", "메타광고"],
    ["9월30일", "₩500,000", "1,000", "2,000", "20", "40", "", "", "", "", "₩100,000", "₩400,000", "5", "10"],
  ]);
  const withoutTracking = buildAdPerformanceMetricSnapshot({
    sourceRows,
    dashboardStartDate: "2026-09-01",
    tracking: null,
    manualInputs: {},
    exclusiveEndDate: "2026-10-01",
  });
  assert.deepEqual(withoutTracking[0], {
    metricDate: "2026-09-30",
    googleImpressions: 1000,
    metaImpressions: 2000,
    googleClicks: 20,
    metaClicks: 40,
    googleAdLeads: 5,
    metaAdLeads: 10,
    googleSpend: 100000,
    metaSpend: 400000,
    googleLandingLeads: 0,
    metaLandingLeads: 0,
    adminCumulativeLeads: 0,
    chatRoomMembers: null,
    organicLeadsByName: {},
  });

  const tracking: MeaningTrackingImport = {
    dailyByDate: {
      "09-30": {
        fullDate: "2026-09-30",
        googleLandingDb: 7,
        metaLandingDb: 11,
        organicByChannel: { 유튜브A: 3, 유튜브B: 4 },
      },
    },
    organicChannels: ["유튜브A", "유튜브B"],
    matchedRowCount: 4,
  };
  const combined = buildAdPerformanceMetricSnapshot({
    sourceRows,
    dashboardStartDate: "2026-09-01",
    tracking,
    manualInputs: {
      "2026-09-30": {
        bizupDbCumulative: 77,
        chatMembersCumulative: 120,
      },
    },
    exclusiveEndDate: "2026-10-01",
  });
  assert.deepEqual(combined[0], {
    ...withoutTracking[0],
    googleLandingLeads: 7,
    metaLandingLeads: 11,
    adminCumulativeLeads: 77,
    chatRoomMembers: 120,
    organicLeadsByName: { 유튜브A: 3, 유튜브B: 4 },
  });
});
