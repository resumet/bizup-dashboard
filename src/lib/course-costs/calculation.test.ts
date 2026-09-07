import assert from "node:assert/strict";
import test from "node:test";
import { calculateBurden, calculateTax, parseCourseCostInput } from "./calculation";
import { COURSE_COST_DEFAULT_CATEGORIES } from "./types";

test("기본 비용 항목은 광고 매체를 분리하고 스튜디오와 PD 인건비를 통합한다", () => {
  assert.ok(COURSE_COST_DEFAULT_CATEGORIES.COMPANY.some(([, name]) => name === "스튜디오 (PD인건비) 비용"));
  assert.deepEqual(
    COURSE_COST_DEFAULT_CATEGORIES.SHARED.filter(([code]) => code === "GOOGLE_AD" || code === "META_AD").map(([, name]) => name),
    ["구글광고비", "메타광고비"],
  );
});

test("과세 총액 1,100,000원을 공급가액과 부가세로 분리한다", () => {
  assert.deepEqual(calculateTax(1_100_000, "TAXABLE"), {
    grossAmount: 1_100_000,
    supplyAmount: 1_000_000,
    vatAmount: 100_000,
  });
});

test("면세와 영세율은 부가세가 0원이다", () => {
  assert.equal(calculateTax(123_456, "TAX_FREE").vatAmount, 0);
  assert.equal(calculateTax(123_456, "ZERO_RATED").supplyAmount, 123_456);
});

test("공동부담 60:40 금액 합계는 정산금액과 일치한다", () => {
  assert.deepEqual(calculateBurden(1_000_001, "SHARED", 60), {
    companyShareRate: 60,
    instructorShareRate: 40,
    companyShareAmount: 600_001,
    instructorShareAmount: 400_000,
  });
});

test("지급완료 비용은 지급일이 필수다", () => {
  assert.throws(() => parseCourseCostInput({
    name: "광고비", managerName: "담당자", burdenType: "SHARED", grossAmount: 1000,
    taxType: "TAXABLE", status: "PAID", paidDate: "", evidenceRequired: false,
    companyShareRate: 50,
  }), /지급연월일/u);
});

test("비용 입력은 과세·정산반영으로 고정하고 증빙과 비고 입력을 무시한다", () => {
  const result = parseCourseCostInput({
    name: "광고비", managerName: "담당자", burdenType: "COMPANY", grossAmount: 1100,
    taxType: "TAX_FREE", status: "PLANNED", paidDate: "2026-09-03",
    evidenceRequired: true, evidenceNeedsReview: true, evidenceTypes: ["세금계산서"],
    includeInSettlement: false, note: "저장하지 않을 비고",
  });
  assert.equal(result.taxType, "TAXABLE");
  assert.equal(result.paidDate, "");
  assert.equal(result.evidenceRequired, false);
  assert.deepEqual(result.evidenceTypes, []);
  assert.equal(result.includeInSettlement, true);
  assert.equal(result.note, "");
});
