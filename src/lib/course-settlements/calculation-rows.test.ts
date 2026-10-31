import assert from "node:assert/strict";
import test from "node:test";
import { companyCostCalculationRows, sharedCostCalculationRows } from "./calculation-rows";

test("공동 부담 비용만 E 하위 번호로 원래 순서대로 만든다", () => {
  const rows = sharedCostCalculationRows([
    { burdenType: "SHARED", name: "촬영비", grossAmount: 110_000 },
    { burdenType: "COMPANY", name: "광고비", grossAmount: 220_000 },
    { burdenType: "SHARED", name: "대관비", grossAmount: 330_000 },
  ]);

  assert.deepEqual(rows, [
    { code: "E-1", label: "촬영비", value: 110_000, formula: "공동 부담 비용 상세", detail: true },
    { code: "E-2", label: "대관비", value: 330_000, formula: "공동 부담 비용 상세", detail: true },
  ]);
});

test("공동 부담 비용이 없으면 상세 행을 만들지 않는다", () => {
  assert.deepEqual(
    sharedCostCalculationRows([
      { burdenType: "INSTRUCTOR", name: "교통비", grossAmount: 50_000 },
    ]),
    [],
  );
});

test("회사 단독 부담 비용만 N 하위 번호로 원래 순서대로 만든다", () => {
  const rows = companyCostCalculationRows([
    { burdenType: "COMPANY", name: "광고비", grossAmount: 220_000 },
    { burdenType: "SHARED", name: "촬영비", grossAmount: 110_000 },
    { burdenType: "COMPANY", name: "스튜디오비", grossAmount: 330_000 },
  ]);

  assert.deepEqual(rows, [
    { code: "N-1", label: "광고비", value: 220_000, formula: "회사 단독 부담 비용 상세", detail: true },
    { code: "N-2", label: "스튜디오비", value: 330_000, formula: "회사 단독 부담 비용 상세", detail: true },
  ]);
});

test("회사 단독 부담 비용이 없으면 N 상세 행을 만들지 않는다", () => {
  assert.deepEqual(
    companyCostCalculationRows([
      { burdenType: "INSTRUCTOR", name: "교통비", grossAmount: 50_000 },
    ]),
    [],
  );
});
