import assert from "node:assert/strict";
import test from "node:test";

import { isPartialRefundRosterRow, partialRefundRosterAmounts } from "./partial-refund";
import type { RosterRow } from "./types";

const row = {
  values: {
    partialRefunded: true,
    originalPaymentAmount: "100000",
    refundAmount: "30000",
    paymentAmount: "70000",
  },
} as Pick<RosterRow, "values">;

test("부분환불 명단은 주문금액·환불금액·남은 매출을 구분한다", () => {
  assert.equal(isPartialRefundRosterRow(row), true);
  assert.deepEqual(partialRefundRosterAmounts(row), {
    originalAmount: 100000,
    refundAmount: 30000,
    revenueAmount: 70000,
  });
});

test("기존 partial_refund 표시는 부분환불자로 인식한다", () => {
  const legacy = {
    values: { refundSource: "partial_refund", paymentAmount: "70000" },
  } as Pick<RosterRow, "values">;
  assert.equal(isPartialRefundRosterRow(legacy), true);
  assert.equal(partialRefundRosterAmounts(legacy).revenueAmount, 70000);
});
