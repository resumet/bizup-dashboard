import assert from "node:assert/strict";
import test from "node:test";

import { checkRedlockChannels, parseRedlockWorksheet } from "./redlock";

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

test("레드락 RS 채널명을 실제 출연 채널과 대조한다", () => {
  const [checked] = checkRedlockChannels([{
    sheetName: "정산",
    rowNumber: 2,
    instructorName: "홍길동",
    rsChannelName: "홍길동 TV",
    rsFee: 12_345,
    cells: [],
  }], ["홍길동TV", "비즈업클래스"]);

  assert.equal(checked?.channelStatus, "matched");
  assert.equal(checked?.matchedChannelName, "홍길동TV");
});

