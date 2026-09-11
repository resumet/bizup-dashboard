import assert from "node:assert/strict";
import test from "node:test";
import { calculate, configureInputs, DEFAULTS, formatMargin, formatWon, MAX_MONEY, parseMoneyInput } from "./settlement-calculator";

const zeroCosts = { ad: 0, rs: 0, materials: 0, youtube: 0, venue: 0 };
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test("PRD 기본값의 모든 계산 단계가 일치한다", () => {
  const result = calculate(DEFAULTS);
  const expected = { gross: 100_000_000, pg: 7_500_000, afterPg: 92_500_000, fee: 3_052_500, settlement: 89_447_500, shared: 40_000_000, remaining: 49_447_500, half: 24_723_750, execution: 4_950_000, companyCosts: 11_450_000, companyFinal: 13_273_750, companyMargin: 13.27375, vat: 2_472_375, instructorFinal: 27_196_125 };
  for (const [key, value] of Object.entries(expected)) near(result[key as keyof typeof expected]!, value);
});

test("PRD 변경·경계값과 순이익률 표시를 검증한다", () => {
  const cases = [
    { patch: { quantity: 0 }, gross: 0, company: -31_450_000, margin: "계산 불가", instructor: -22_000_000 },
    { patch: { price: 0 }, gross: 0, company: -31_450_000, margin: "계산 불가", instructor: -22_000_000 },
    { patch: { quantity: 100 }, gross: 200_000_000, company: 57_997_500, margin: "29.00%", instructor: 76_392_250 },
    { patch: { ad: 60_000_000 }, gross: 100_000_000, company: -6_676_250, margin: "-6.68%", instructor: 10_696_125 },
    { patch: zeroCosts, gross: 100_000_000, company: 44_723_750, margin: "44.72%", instructor: 49_196_125 },
  ];
  for (const row of cases) {
    const result = calculate({ ...DEFAULTS, ...row.patch });
    near(result.gross, row.gross); near(result.companyFinal, row.company); near(result.instructorFinal, row.instructor);
    assert.equal(formatMargin(result.companyMargin), row.margin);
    if (!row.gross) { assert.equal(result.pg, 0); assert.equal(result.fee, 0); assert.equal(result.companyMargin, null); }
  }
  const ads = calculate({ ...DEFAULTS, ad: 60_000_000 });
  assert.equal(ads.execution, 9_900_000); assert.equal(ads.companyCosts, 16_400_000);
});

test("중간 계산은 반올림하지 않으며 금액 표시만 대칭 반올림한다", () => {
  const result = calculate({ ...DEFAULTS, ...zeroCosts, price: 101, quantity: 1 });
  near(result.pg, 7.575); near(result.fee, 3.083025); near(result.settlement, 90.341975);
  near(result.settlement, result.gross * 0.894475);
  assert.equal(formatWon(-1.5), "−2원"); assert.equal(formatWon(-0.1), "0원");
  assert.equal(formatWon(1.5, true), "+2원"); assert.equal(formatWon(-1.5, true), "−2원");
  assert.equal(formatWon(1000000), "1,000,000원");
});

test("입력 검증: 쉼표·빈칸·최댓값과 잘못된 값", () => {
  assert.deepEqual(parseMoneyInput("3,000,000"), { value: 3_000_000 });
  assert.deepEqual(parseMoneyInput(""), { value: 0 });
  assert.deepEqual(parseMoneyInput("1,000,000,000,000"), { value: MAX_MONEY });
  for (const text of ["-1", "1.5", "abc", "Infinity", "NaN", "1e3", "1조", ",,,", "1,000,000,000,001"]) assert.ok(parseMoneyInput(text).error, text);
  for (const quantity of [-1, 0.5, 101, Infinity, NaN]) assert.throws(() => calculate({ ...DEFAULTS, quantity }));
  for (const price of [-1, 0.5, MAX_MONEY + 1, Infinity, NaN]) assert.throws(() => calculate({ ...DEFAULTS, price }));
  const max = calculate({ ...DEFAULTS, price: MAX_MONEY, quantity: 100 });
  assert.equal(max.gross, 100_000_000_000_000); assert.ok(Number.isFinite(max.companyFinal));
});

test("에이전트 입력은 모두 검증한 후 적용하고 기존 입력을 변경하지 않는다", () => {
  const original = { ...DEFAULTS };
  for (const patch of [{ price: 1, quantity: 101 }, { invalid: 1 }, { price: "100" }, {}, null, []]) assert.throws(() => configureInputs(original, patch));
  assert.deepEqual(original, DEFAULTS);
  assert.equal(configureInputs(original, { quantity: 20, ad: 0 }).quantity, 20);
});
