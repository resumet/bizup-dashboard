import assert from "node:assert/strict";
import test from "node:test";
import readXlsxFile from "read-excel-file/node";
import { unzipSync } from "fflate";

import { adPerformanceExportFileName, buildAdPerformanceXlsx } from "./export-xlsx";
import type { AdPerformanceSheetState } from "./types";

function fixture(): AdPerformanceSheetState {
  return {
    spreadsheetId: "example", spreadsheetUrl: "", sheetName: "테스트 강의",
    sourceRows: [
      ["일자", "총광고비", "노출", "", "클릭", "", "클릭전환", "", "랜딩전환", "", "광고집행비용", "", "광고접수DB"],
      ["", "300,000원", "구글광고", "메타광고"],
      ["10월 14일", "300,000원", "1,000", "2,000", "50", "100", "5%", "0.05", "20%", "0.2", "100,000원", "200,000원", "10", "20", "999", "999"],
    ],
    trackingFileName: "유입.xlsx",
    tracking: {
      dailyByDate: { "10-14": { fullDate: "2026-10-14", googleLandingDb: 5,
        metaLandingDb: 10, landingDbImported: true, organicByChannel: { 블로그: 3, 유튜브: 7 } } },
      organicChannels: ["블로그", "유튜브"], matchedRowCount: 25,
    },
    manualInputs: {
      "2026-10-13": { bizupDbCumulative: null, chatMembersCumulative: 90 },
      "2026-10-14": { bizupDbCumulative: 125, chatMembersCumulative: 100 },
    },
    version: 1, updatedAt: "2026-10-14T00:00:00Z",
  };
}

async function readExport(state: AdPerformanceSheetState) {
  const blob = await buildAdPerformanceXlsx(state, "2026-10-01");
  const buffer = Buffer.from(await blob.arrayBuffer());
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  const files = unzipSync(buffer);
  const xml = Buffer.from(files["xl/worksheets/sheet1.xml"]).toString();
  assert.match(xml, /<mergeCell ref="A1:A2"\s*\/>/u);
  assert.match(xml, /<mergeCell ref="M1:N1"\s*\/>/u);
  assert.match(xml, /<mergeCell ref="Q1:R1"\s*\/>/u);
  assert.match(xml, /xSplit="1"/u);
  assert.match(xml, /ySplit="2"/u);
  const [sheet] = await readXlsxFile(buffer);
  return sheet.data;
}

test("표의 머리글·유입채널·수동 입력·계산값을 숫자 형식의 XLSX로 내보낸다", async () => {
  const state = fixture();
  const snapshot = structuredClone(state);
  const rows = await readExport(state);
  assert.equal(rows[0][12], "광고접수 DB당 단가");
  assert.equal(rows[0][16], "랜딩페이지 접수된DB");
  assert.equal(rows[0][19], "자연유입 (오가닉)");
  assert.deepEqual(rows[1].slice(19, 22), ["블로그", "유튜브", "오가닉총합"]);
  assert.equal(rows[1][1], 300000);
  assert.equal(rows[2][0], "합계");
  assert.deepEqual(rows[2].slice(1), rows[3].slice(1));
  assert.deepEqual(rows[3].slice(0, 16), ["10월 14일", 300000, 1000, 2000, 50, 100, 0.05, 0.05, 0.2, 0.2, 100000, 200000, 10000, 10000, 10, 20]);
  assert.deepEqual(rows[3].slice(16), [5, 10, 15, 3, 7, 10, 25, 20000, 20000, -10000, -10000, 125, 100, 10, 20000, 30000]);
  assert.deepEqual(state, snapshot);
});

test("페이지 크기를 넘는 전체 행과 마지막 행을 내보낸다", async () => {
  const state = fixture();
  state.sourceRows = [...state.sourceRows.slice(0, 2),
    ...Array.from({ length: 105 }, (_, index) => [String(index + 1), "0"])];
  const rows = await readExport(state);
  assert.equal(rows.length, 108);
  assert.equal(rows.at(-1)?.[0], "105");
  assert.equal(rows.at(-1)?.[1], 0);
});

test("유입 파일이 없으면 원본 랜딩값을 사용하고 미입력값과 0을 구분한다", async () => {
  const state = fixture();
  state.tracking = null;
  state.sourceRows[2][14] = "0";
  state.sourceRows[2][15] = "7";
  state.manualInputs = {};
  const rows = await readExport(state);
  assert.equal(rows[3].length, 30);
  assert.deepEqual(rows[3].slice(12, 16), [10000, 10000, 10, 20]);
  assert.deepEqual(rows[3].slice(16, 21), [0, 7, 7, 0, 7]);
  assert.ok(rows[3].slice(21).every((value) => value === null));
  state.sourceRows[2][14] = "";
  state.sourceRows[2][15] = "";
  const blankRows = await readExport(state);
  assert.ok(blankRows[3].slice(16).every((value) => value === null));
});

test("연도가 다른 유입 데이터는 섞지 않고 이전 날짜의 수동 입력으로 톡방 증감을 계산한다", async () => {
  const state = fixture();
  state.tracking!.dailyByDate["10-14"].fullDate = "2025-10-14";
  state.manualInputs["2026-10-14"].chatMembersCumulative = 80;
  const rows = await readExport(state);
  assert.deepEqual(rows[3].slice(16, 23), [999, 999, 1998, null, null, 0, 1998]);
  assert.equal(rows[3][29], -10);
});

test("수식처럼 시작하는 날짜와 채널명은 실행 가능한 수식이 아닌 문자열로 보존한다", async () => {
  const state = fixture();
  state.sourceRows[2][0] = '=HYPERLINK("https://example.test")';
  state.tracking!.organicChannels[0] = "=1+1";
  const rows = await readExport(state);
  assert.equal(rows[3][0], state.sourceRows[2][0]);
  assert.equal(rows[1][19], "=1+1");
  assert.match(adPerformanceExportFileName('강의/이름:*?'), /^강의_이름____광고지표_\d{4}-\d{2}-\d{2}\.xlsx$/u);
});
