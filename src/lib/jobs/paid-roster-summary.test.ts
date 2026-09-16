import assert from "node:assert/strict";
import test from "node:test";

import { summarizePaidRoster } from "./paid-roster-summary";
import type { RosterRow } from "./types";

function row(
  id: string,
  phone: string,
  optionName: string,
  paymentAmount: string,
  email = "",
): RosterRow {
  return {
    id,
    sourceRowNumber: Number(id),
    normalizedPhone: phone,
    isDuplicate: false,
    groupChatJoined: false,
    isExtraParticipant: false,
    isManuallyAdded: false,
    memo: "",
    values: {
      courseName: "강의",
      optionName,
      customerName: `결제자 ${id}`,
      email,
      phone,
      referrer: "",
      source: "",
      adMedia: "",
      paymentAmount,
    },
  };
}

test("유료수강생 요약은 결제자를 중복 제외하고 결제 건 금액은 모두 합산한다", () => {
  const summary = summarizePaidRoster([
    row("1", "01012345678", "기본반", "100000"),
    row("2", "01012345678", "기본반", "50000"),
    row("3", "01012345678", "심화반", "200000"),
    row("4", "01099998888", "기본반", "300000"),
  ]);

  assert.equal(summary.payerCount, 2);
  assert.equal(summary.paymentAmount, 650000);
  assert.deepEqual(summary.options, [
    { optionName: "기본반", payerCount: 2 },
    { optionName: "심화반", payerCount: 1 },
  ]);
});

test("전화번호가 없으면 이메일로 중복 제외하고 연락처가 없으면 각 행을 센다", () => {
  const summary = summarizePaidRoster([
    row("1", "", "", "3490000.50", " PAYER@example.com "),
    row("2", "", "", "0", "payer@example.com"),
    row("3", "", "", "잘못된 금액"),
    row("4", "", "", "100"),
  ]);

  assert.equal(summary.payerCount, 3);
  assert.equal(summary.paymentAmount, 3490100.5);
  assert.deepEqual(summary.options, [
    { optionName: "옵션 없음", payerCount: 3 },
  ]);
});
