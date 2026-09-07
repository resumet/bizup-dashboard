import assert from "node:assert/strict";
import test from "node:test";
import type { CourseCost } from "./types";
import { filterSettlementCosts } from "./server";

test("지급완료 비용은 분석 월과 정산일이 달라도 정산에 반영한다", () => {
  const costs = [
    { id: "paid", status: "PAID", paidDate: "2026-09-03", includeInSettlement: true },
    { id: "planned", status: "PLANNED", paidDate: "", includeInSettlement: true },
    { id: "canceled", status: "CANCELED", paidDate: "2026-09-03", includeInSettlement: true },
  ] as CourseCost[];
  const analysis = { monthlyAnalyses: [{ periodYear: 2026, periodMonth: 6 }] };

  assert.deepEqual(filterSettlementCosts(costs, analysis).map((cost) => cost.id), ["paid"]);
});
