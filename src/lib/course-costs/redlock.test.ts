import assert from "node:assert/strict";
import test from "node:test";

import { checkRedlockChannels, parseRedlockWorksheet, reconcileRedlockPayers, summarizeRedlockChannelFees } from "./redlock";

test("레드락 엑셀은 C열 강사명이 현재 정산 강사와 일치하는 행만 가져온다", () => {
  const rows = parseRedlockWorksheet({
    name: "정산",
    rows: [
      ["플랫폼별 결제자 리스트"],
      ["[비즈업클래스] 결제자 명단"],
      ["번호", "채널명", "강사", "무료강의일", "이름", "이메일", "결제금액", "토스수수료", "실매출", "RS", "출연료"],
      [1, "홍길동TV", "홍길동", null, "수강생", "student@example.com", 100_000, 7_500, 92_500, 12_345, null],
      ["소계", null, null, null, null, null, 100_000, 7_500, 92_500, 45_678, null],
      [2, "다른채널", "김강사", null, "수강생", "other@example.com", 100_000, 7_500, 92_500, 30_000, null],
    ],
  }, "홍 길동");

  assert.deepEqual(rows.map((row) => ({
    instructor: row.instructorName,
    channel: row.rsChannelName,
    fee: row.rsFee,
  })), [{ instructor: "홍길동", channel: "홍길동TV", fee: 45_678 }]);
});

test("소계 전 같은 채널에서 강사가 바뀌면 직전 채널명을 이어받는다", () => {
  const rows = parseRedlockWorksheet({
    name: "정산",
    rows: [
      ["번호", "채널명", "강사", "무료강의일", "이름", "이메일", "결제금액", "RS"],
      [1, "초월스토리", "김해준", null, "김해준 수강생", "kim@example.com", 100_000, 10_000],
      [2, null, null, null, "김해준 수강생2", "kim2@example.com", 100_000, 10_000],
      [3, null, "초코라떼", null, "초코 수강생", "choco@example.com", 100_000, 10_000],
      [4, null, null, null, "초코 수강생2", "choco2@example.com", 100_000, 10_000],
      ["소계", null, null, null, null, null, 400_000, 40_000],
    ],
  }, "초코라떼");

  assert.deepEqual(rows.map((row) => ({ channel: row.rsChannelName, fee: row.rsFee, payerEmails: row.payers.map((payer) => payer.email) })), [{
    channel: "초월스토리",
    fee: 40_000,
    payerEmails: ["choco@example.com", "choco2@example.com"],
  }]);
});

test("레드락 채널별 결제자를 이메일로 실제 결제자와 대조한다", () => {
  const [row] = parseRedlockWorksheet({
    name: "정산",
    rows: [
      ["번호", "채널명", "강사", "무료강의일", "이름", "이메일", "결제금액", "RS"],
      [1, "강사TV", "강사", null, "일치 수강생", "MATCH@example.com", 100_000, 10_000],
      [2, null, null, null, "미등록 수강생", "missing@example.com", 100_000, 10_000],
      [3, null, null, null, "이메일 없음", null, 100_000, 10_000],
      ["소계", null, null, null, null, null, 300_000, 30_000],
    ],
  }, "강사");

  const [result] = reconcileRedlockPayers([row], [{ name: "실제 수강생", email: "match@example.com" }]);
  assert.equal(result?.matchedCount, 1);
  assert.deepEqual(result?.missingPayers.map((payer) => payer.email), ["missing@example.com"]);
  assert.deepEqual(result?.missingEmailPayers.map((payer) => payer.name), ["이메일 없음"]);
});

test("레드락 RS 채널명을 실제 출연 채널과 대조한다", () => {
  const [checked] = checkRedlockChannels([{
    sheetName: "정산",
    rowNumber: 2,
    instructorName: "홍길동",
    rsChannelName: "홍길동 TV",
    rsFee: 12_345,
    cells: [],
    payers: [],
  }], ["홍길동TV", "비즈업클래스"]);

  assert.equal(checked?.channelStatus, "matched");
  assert.equal(checked?.matchedChannelName, "홍길동TV");
});

test("레드락 채널별 RS 수수료를 합산하며 채널명과 금액이 없는 행은 제외한다", () => {
  const result = summarizeRedlockChannelFees([
    { sheetName: "정산", rowNumber: 2, instructorName: "초코라떼", rsChannelName: "초월스토리", rsFee: 10_000, cells: [], payers: [] },
    { sheetName: "정산", rowNumber: 8, instructorName: "초코라떼", rsChannelName: "초월 스토리", rsFee: 5_932_816, cells: [], payers: [] },
    { sheetName: "정산", rowNumber: 20, instructorName: "초코라떼", rsChannelName: "비즈업클럽", rsFee: 2_000, cells: [], payers: [] },
    { sheetName: "정산", rowNumber: 21, instructorName: "초코라떼", rsChannelName: "", rsFee: 4_000, cells: [], payers: [] },
    { sheetName: "정산", rowNumber: 22, instructorName: "초코라떼", rsChannelName: "미입력", rsFee: null, cells: [], payers: [] },
  ]);

  assert.deepEqual(result, [
    { channelName: "비즈업클럽", rsFee: 2_000, rowCount: 1 },
    { channelName: "초월스토리", rsFee: 5_942_816, rowCount: 2 },
  ]);
});

