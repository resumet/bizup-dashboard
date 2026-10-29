import assert from "node:assert/strict";
import test from "node:test";

import {
  isTossPaymentLabAmount,
  isTossPaymentLabOrderId,
} from "./toss-payment-lab";

test("토스 결제 실험은 100만원만 유효한 금액으로 처리한다", () => {
  assert.equal(isTossPaymentLabAmount("1000000"), true);
  assert.equal(isTossPaymentLabAmount("999999"), false);
  assert.equal(isTossPaymentLabAmount("not-a-number"), false);
});

test("토스 결제 실험 주문번호 형식을 검증한다", () => {
  assert.equal(isTossPaymentLabOrderId("LAB-1793250000000-012345abcdef"), true);
  assert.equal(isTossPaymentLabOrderId("ORDER-1793250000000-012345abcdef"), false);
  assert.equal(isTossPaymentLabOrderId("LAB-1793250000000-012345abcdeg"), false);
});
