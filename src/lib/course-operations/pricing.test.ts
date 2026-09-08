import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDiscountRate,
  calculateEarlyBirdDiscountAmount,
  calculateTwelveMonthInstallment,
} from "./pricing";

test("정가와 할인가로 할인율을 소수점 한 자리까지 계산한다", () => {
  assert.equal(calculateDiscountRate("2,990,000", "2,290,000"), 23.4);
  assert.equal(calculateDiscountRate(100_000, 100_000), 0);
  assert.equal(calculateDiscountRate(100_000, 0), 100);
});

test("정가가 0이거나 할인가가 더 높으면 할인율을 계산하지 않는다", () => {
  assert.equal(calculateDiscountRate(0, 0), null);
  assert.equal(calculateDiscountRate(100_000, 120_000), null);
});

test("정상가와 판매가의 차액을 얼리버드 할인금액으로 계산한다", () => {
  assert.equal(calculateEarlyBirdDiscountAmount("2,990,000", "2,290,000"), 700_000);
  assert.equal(calculateEarlyBirdDiscountAmount("100,000", ""), null);
  assert.equal(calculateEarlyBirdDiscountAmount("100,000", "120,000"), null);
});

test("12개월 무이자 월 납부액을 100원 단위로 반올림한다", () => {
  assert.equal(calculateTwelveMonthInstallment("2,990,000", "2,290,000"), 190_800);
  assert.equal(calculateTwelveMonthInstallment(2_000, 1_800), 200);
  assert.equal(calculateTwelveMonthInstallment("100,000", ""), null);
});
