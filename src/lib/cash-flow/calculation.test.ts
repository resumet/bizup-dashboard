import assert from "node:assert/strict";
import test from "node:test";

import { addMonths, forecastCashFlow } from "./calculation";

test("addMonths handles year boundaries", () => {
  assert.equal(addMonths("2026-11", 3), "2027-02");
});

test("forecastCashFlow aggregates included course flows and fixed expenses", () => {
  const forecast = forecastCashFlow({
    startMonth: "2026-09",
    currentBalance: 10_000_000,
    monthlyFixedExpense: 1_000_000,
    months: 4,
    plans: [
      { courseId: "a", expectedMonth: "2026-09", novaInflow: 5_000_000, instructorPayout: 2_000_000, isIncluded: true },
      { courseId: "b", expectedMonth: "2026-10", novaInflow: 8_000_000, instructorPayout: 4_000_000, isIncluded: true },
      { courseId: "c", expectedMonth: "2026-10", novaInflow: 99_000_000, instructorPayout: 0, isIncluded: false },
    ],
  });

  assert.deepEqual(forecast.map((item) => item.closingBalance), [12_000_000, 15_000_000, 14_000_000, 13_000_000]);
  assert.equal(forecast[1].novaInflow, 8_000_000);
});

test("forecastCashFlow supports a negative projected balance", () => {
  const forecast = forecastCashFlow({
    startMonth: "2026-09",
    currentBalance: 500_000,
    monthlyFixedExpense: 600_000,
    months: 2,
    plans: [],
  });
  assert.equal(forecast[0].closingBalance, -100_000);
  assert.equal(forecast[1].closingBalance, -700_000);
});
