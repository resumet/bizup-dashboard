import assert from "node:assert/strict";
import test from "node:test";

import { calculateDiscountRate } from "./pricing";

test("정가와 할인가로 할인율을 소수점 한 자리까지 계산한다", () => {
  assert.equal(calculateDiscountRate("2,990,000", "2,290,000"), 23.4);
  assert.equal(calculateDiscountRate(100_000, 100_000), 0);
  assert.equal(calculateDiscountRate(100_000, 0), 100);
});

test("정가가 0이거나 할인가가 더 높으면 할인율을 계산하지 않는다", () => {
  assert.equal(calculateDiscountRate(0, 0), null);
  assert.equal(calculateDiscountRate(100_000, 120_000), null);
});

