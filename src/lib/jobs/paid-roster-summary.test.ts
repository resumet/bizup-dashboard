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
  assert.equal(summary.partialRefundPayerCount, 0);
  assert.equal(summary.partialRefundAmount, 0);
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

test("현금결제자는 기존 결제자 기준으로 중복 제외하고 복합 결제도 포함한다", () => {
  const cash = (value: RosterRow, method: string) => ({ ...value, values: { ...value.values, paymentMethod: method } });
  const summary = summarizePaidRoster([
    cash(row("1", "01012345678", "기본반", "100000"), "현금결제"),
    cash(row("2", "01012345678", "심화반", "200000"), " 현금결제 / 신용카드 "),
    cash(row("3", "01099998888", "기본반", "100000"), "신용카드"),
    cash(row("4", "", "기본반", "100000", " PAYER@example.com "), "현금결제"),
    cash(row("5", "", "심화반", "200000", "payer@example.com"), "현금결제"),
    cash(row("6", "01077778888", "기본반", "100000"), "무통장입금"),
  ]);
  assert.equal(summary.cashPayerCount, 2);
  assert.equal(summary.payerCount, 4);
  assert.equal(summary.paymentAmount, 800000);
});

test("결제방법이 미입력이거나 현금결제자가 없으면 0명을 반환한다", () => {
  assert.equal(summarizePaidRoster([]).cashPayerCount, 0);
  assert.equal(summarizePaidRoster([row("1", "01012345678", "기본반", "100000")]).cashPayerCount, 0);
});

test("부분환불자는 전체 결제자와 매출에 포함하면서 별도 인원과 남은 매출을 집계한다", () => {
  const partial = row("2", "01099998888", "심화반", "70000");
  partial.values.partialRefunded = true;
  partial.values.originalPaymentAmount = "100000";
  partial.values.refundAmount = "30000";
  const summary = summarizePaidRoster([
    row("1", "01012345678", "기본반", "200000"),
    partial,
  ]);
  assert.equal(summary.payerCount, 2);
  assert.equal(summary.paymentAmount, 270000);
  assert.equal(summary.partialRefundPayerCount, 1);
  assert.equal(summary.partialRefundAmount, 70000);
});
