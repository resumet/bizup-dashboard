import assert from "node:assert/strict";
import test from "node:test";
import { adPerformanceTableRow, adPerformanceTableTotals, buildAdPerformanceTableHeaders, formatAdPerformanceTableCell } from "./sheet-table";
import type { AdPerformanceSheetState } from "./types";

function fixture(): AdPerformanceSheetState {
  return {
    spreadsheetId: "test", spreadsheetUrl: "", sheetName: "test", trackingFileName: null,
    sourceRows: [[], [],
      ["2026-10-02", "900", "900", "600", "90", "60", "10%", "10%", "10%", "10%", "600", "300", "30", "10", "15", "5"],
      ["2026-10-01", "100", "100", "200", "10", "20", "10%", "10%", "10%", "10%", "100", "0", "10", "0", "5", "0"],
      ["2026-10-03"],
      ["합계", "999999", "999999"],
    ],
    tracking: {
      dailyByDate: { "2026-10-02": { fullDate: "2026-10-02", googleLandingDb: 7, metaLandingDb: 3, landingDbImported: true, organicByChannel: { 블로그: 4 } } },
      organicChannels: ["블로그"], matchedRowCount: 14,
    },
    manualInputs: {
      "2026-10-01": { bizupDbCumulative: 100, chatMembersCumulative: 100 },
      "2026-10-02": { bizupDbCumulative: 120, chatMembersCumulative: 115 },
    },
    version: 1, updatedAt: "",
  };
}

test("합계는 날짜순 최신 누적값을 사용하고 단가·전환율은 합산 분모로 다시 계산한다", () => {
  const state = fixture();
  const snapshot = structuredClone(state);
  const cells = adPerformanceTableTotals(state.sourceRows.slice(2), "2026-10-01", state);
  assert.equal(cells.length, 31);
  assert.equal(cells[1].value, 1000);
  assert.equal(cells[6].value, 100 / 1000);
  assert.equal(cells[8].value, 40 / 100);
  assert.equal(cells[12].value, 700 / 40);
  assert.equal(cells[13].value, 300 / 10);
  assert.equal(cells[16].value, 12);
  assert.equal(cells[17].value, 3);
  assert.equal(cells[18].value, 15);
  assert.equal(cells[19].value, 4);
  assert.equal(cells[21].value, 19);
  assert.equal(cells[22].value, 700 / 12);
  assert.equal(cells[24].value, 700 / 40 - 700 / 12);
  assert.equal(cells[26].value, 120);
  assert.equal(cells[27].value, 115);
  assert.equal(cells[28].value, 15);
  assert.equal(cells[29].value, 1000 / 15);
  assert.equal(cells[30].value, 1000 / 15);
  assert.deepEqual(state, snapshot);
});

test("100행 이후 데이터도 합계에 포함하고 미입력과 실제 0을 구분한다", () => {
  const rows = Array.from({ length: 105 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return [date, "100", "0", "0", "0", "0", "", "", "", "", "100", "0", "1", "0"];
  });
  const totals = adPerformanceTableTotals(rows, "2026-01-01", null);
  assert.equal(totals[1].value, 10500);
  assert.equal(totals[12].value, 100);
  assert.equal(totals[14].value, 105);
  assert.equal(totals[15].value, 0);
  assert.equal(totals[13].value, null);
  assert.equal(totals[6].value, null);
  assert.equal(totals[26].value, null);
  assert.equal(formatAdPerformanceTableCell(totals[13]), "-");
  assert.equal(formatAdPerformanceTableCell(totals[15]), "0");
  const blank = adPerformanceTableTotals([], "2026-01-01", null);
  assert.equal(blank[0].value, "합계");
  assert.ok(blank.slice(1).every((item) => item.value === null));
});

test("광고집행비용과 광고접수 DB 사이에 매체별 단가를 표시하며 유입 파일 없이도 계산한다", () => {
  const state = fixture();
  const headers = buildAdPerformanceTableHeaders(state.sourceRows.slice(0, 2));
  assert.deepEqual(headers.top.slice(-3).map((item) => item.key), ["columns-10-11", "ad-db-unit-cost", "columns-12-13"]);
  assert.equal(headers.top.reduce((sum, item) => sum + item.columnSpan, 0), 16);
  assert.equal(headers.bottom.length, 15);
  const { cells } = adPerformanceTableRow(state.sourceRows[2], "2026-10-01", null);
  assert.deepEqual(cells.slice(10, 16).map((item) => item.value), [600, 300, 20, 30, 30, 10]);
});
