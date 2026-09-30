import assert from "node:assert/strict";
import test from "node:test";

import {
  meaningSheetDateKey,
  parseMeaningTrackingSheet,
} from "./meaning-tracking";
import {
  buildMeaningSheetHeaders,
  parseMeaningSheetCsv,
} from "./meaning-sheet";

test("Google Sheets CSV의 빈 셀과 여러 제목 행을 보존한다", () => {
  const result = parseMeaningSheetCsv(
    '"날짜","광고","","DB"\n"","구글","메타",""\n"9월28일","10","20","3"\n,,,\n',
  );

  assert.equal(result.rowCount, 3);
  assert.equal(result.columnCount, 14);
  assert.deepEqual(result.rows[0].slice(0, 4), ["날짜", "광고", "", "DB"]);
  assert.deepEqual(result.rows[1].slice(0, 4), ["", "구글", "메타", ""]);
  assert.deepEqual(result.rows[2].slice(0, 4), ["9월28일", "10", "20", "3"]);
  assert.ok(result.rows.every((row) => row.length === 14));
});

test("Google Sheets CSV는 A열부터 N열까지만 유지한다", () => {
  const result = parseMeaningSheetCsv(
    "A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P\n1,2\n",
  );

  assert.equal(result.columnCount, 14);
  assert.equal(result.rows[0].at(-1), "N");
  assert.equal(result.rows[0].includes("O"), false);
  assert.deepEqual(result.rows[1].slice(0, 3), ["1", "2", ""]);
  assert.equal(result.rows[1].length, 14);
});

test("1행 그룹명과 2행 값을 사용해 A:N 전체 헤더를 재구성한다", () => {
  const headers = buildMeaningSheetHeaders([
    [
      "미닝웨비나",
      "총광고비",
      "광고 노출",
      "",
      "광고 클릭",
      "",
      "광고 클릭 전환율",
      "",
      "랜딩 전환율",
      "",
      "광고집행비용",
      "",
      "광고접수DB",
      "",
    ],
    ["", "₩1,572,025", "", ""],
  ]);

  assert.deepEqual(
    headers.top.map(({ label, columnSpan, rowSpan }) => ({
      label,
      columnSpan,
      rowSpan,
    })),
    [
      { label: "미닝웨비나", columnSpan: 1, rowSpan: 2 },
      { label: "총광고비", columnSpan: 1, rowSpan: undefined },
      { label: "광고 노출", columnSpan: 2, rowSpan: undefined },
      { label: "광고 클릭", columnSpan: 2, rowSpan: undefined },
      { label: "광고 클릭 전환율", columnSpan: 2, rowSpan: undefined },
      { label: "랜딩 전환율", columnSpan: 2, rowSpan: undefined },
      { label: "광고집행비용", columnSpan: 2, rowSpan: undefined },
      { label: "광고접수DB", columnSpan: 2, rowSpan: undefined },
    ],
  );
  assert.deepEqual(headers.bottom.map(({ label }) => label), [
    "₩1,572,025",
    "구글광고",
    "메타광고",
    "구글광고",
    "메타광고",
    "구글광고",
    "메타광고",
    "구글광고",
    "메타광고",
    "구글광고",
    "메타광고",
    "구글광고",
    "메타광고",
  ]);
});

test("일자별 묶음의 구글·메타 총 인원과 유튜브 코드별 자연유입을 합산한다", () => {
  const result = parseMeaningTrackingSheet([
    ["2026.09.30  |  총 57명 / 신규 43명 / 기존 14명"],
    ["채널", "코드", "진행 매체", "신규 가입자", "기존 가입자", "총 인원"],
    ["페이드", "그로스임팩트", "메타", 30, 10, 40],
    ["제휴", "실전부업클럽", "유튜브", 8, 3, 11],
    ["제휴", "꿈꾸는사람들", "유튜브", 5, 1, 6],
    ["2026.09.29  |  총 112명 / 신규 85명 / 기존 27명"],
    ["채널", "코드", "진행 매체", "신규 가입자", "기존 가입자", "총 인원"],
    ["페이드", "그로스임팩트", "메타", 51, 15, 66],
    ["페이드", "그로스임팩트", "구글", 1, 0, 1],
    ["제휴", "꿈꾸는사람들", "유튜브", 27, 8, 35],
    ["제휴", "초월스토리", "유튜브", 1, 1, 2],
  ]);

  assert.deepEqual(result.organicChannels, [
    "실전부업클럽",
    "꿈꾸는사람들",
    "초월스토리",
  ]);
  assert.equal(result.dailyByDate["09-30"].metaLandingDb, 40);
  assert.equal(result.dailyByDate["09-30"].googleLandingDb, 0);
  assert.deepEqual(result.dailyByDate["09-30"].organicByChannel, {
    실전부업클럽: 11,
    꿈꾸는사람들: 6,
  });
  assert.equal(result.dailyByDate["09-29"].metaLandingDb, 66);
  assert.equal(result.dailyByDate["09-29"].googleLandingDb, 1);
  assert.equal(result.dailyByDate["09-29"].organicByChannel.꿈꾸는사람들, 35);
  assert.equal(result.dailyByDate["09-29"].organicByChannel.초월스토리, 2);
});

test("유튜브 코드는 등장 날짜와 관계없이 열로 등록하고 같은 날짜 값은 합산한다", () => {
  const result = parseMeaningTrackingSheet([
    ["2026-09-28 | 합계"],
    ["채널", "코드", "진행 매체", "신규 가입자", "기존 가입자", "총 인원"],
    ["제휴", "꿈꾸는사람들", "유튜브", 10, 2, 12],
    ["제휴", "꿈꾸는사람들", "유튜브", 3, 0, 3],
    ["2026-09-24 | 합계"],
    ["채널", "코드", "진행 매체", "신규 가입자", "기존 가입자", "총 인원"],
    ["제휴", "과거에만등장", "유튜브", 2, 1, 3],
  ]);

  assert.deepEqual(result.organicChannels, ["꿈꾸는사람들", "과거에만등장"]);
  assert.equal(result.dailyByDate["09-28"].organicByChannel.꿈꾸는사람들, 15);
  assert.equal(result.dailyByDate["09-24"].organicByChannel.과거에만등장, 3);
});

test("Google 시트의 월일 표기를 엑셀 날짜 키와 연결한다", () => {
  assert.equal(meaningSheetDateKey("9월30일"), "09-30");
  assert.equal(meaningSheetDateKey("2026.10.1"), "10-01");
  assert.equal(meaningSheetDateKey("합계"), null);
});
