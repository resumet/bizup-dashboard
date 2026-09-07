import assert from "node:assert/strict";
import test from "node:test";
import readXlsxFile from "read-excel-file/node";

import {
  aggregateMonthlyAnalyses,
  analyzeWorkbook,
  analyzeWorkbooks,
  calculateCostSettlement,
  calculateStatement,
  normalizeName,
  parseAmount,
  parsePastedExpenses,
  roundWon,
  type Cell,
  type WorkbookInput,
} from "./engine";

function workbook(overrides?: Partial<WorkbookInput>): WorkbookInput {
  const toss: Cell[][] = [Array(20).fill(""), Array(20).fill(""), Array(20).fill("")];
  toss[0][19] = "강사명";
  toss[1][19] = "김\u200B강사"; toss[1][10] = 100.49; toss[1][11] = 3.5;
  toss[2][19] = "김강사"; toss[2][10] = 100.5;
  const tossCancel = Array(20).fill("") as Cell[];
  tossCancel[19] = "김강사"; tossCancel[10] = -20.5;
  toss.push(tossCancel);
  const cash: Cell[][] = [Array(9).fill(""), Array(9).fill("")];
  cash[0][8] = "강사명";
  cash[1][8] = "김강사"; cash[1][5] = 50.5; cash[1][6] = -10.5;
  const service: Cell[][] = [Array(6).fill(""), Array(6).fill("")];
  service[0][1] = "강사명";
  service[1][1] = "김강사"; service[1][5] = 5.5;
  return {
    fileName: "비즈업클래스_26.05.xlsx", fileSize: 100, inputOrder: 0,
    sheets: [
      { sheet: "비즈업_토스", data: toss },
      { sheet: "비즈업_무통장", data: cash },
      { sheet: "비즈업_부가서비스", data: service },
      {
        sheet: "비즈업_요약",
        data: [
          ["2026년 5월 비즈업클래스 매출 요약"],
          ["강사명"],
          ["김강사"],
        ],
      },
    ],
    ...overrides,
  };
}

test("명세의 이름·금액·음수 절반 반올림 규칙을 따른다", () => {
  assert.equal(normalizeName(" 김\u200B  강사 "), "김 강사");
  assert.equal(parseAmount("(1,234원)"), -1234);
  assert.equal(roundWon(-20.5), -21);
});

test("1차 계산 골든 값 finalSettlement 203을 만든다", () => {
  const result = analyzeWorkbook(workbook()).instructorResults[0];
  assert.deepEqual({
    tossSales: result.tossSales, pgFee: result.pgFee, cashPayments: result.cashPayments,
    cashCancellations: result.cashCancellations, cashSales: result.cashSales,
    totalSales: result.totalSales, settlementBase: result.settlementBase,
    systemNovaFee: result.systemNovaFee, additionalServiceFee: result.additionalServiceFee,
    settlementAmount: result.settlementAmount, finalSettlement: result.finalSettlement,
  }, {
    tossSales: 180, pgFee: 4, cashPayments: 51, cashCancellations: -11, cashSales: 40,
    totalSales: 220, settlementBase: 216, systemNovaFee: 7, additionalServiceFee: 6,
    settlementAmount: 163, finalSettlement: 203,
  });
});

test("월별 계산 후 합산하고 없는 월에는 0 결과를 삽입한다", () => {
  const second = workbook({ fileName: "비즈업클래스_26.06.xlsx", inputOrder: 1 });
  second.sheets.find((item) => item.sheet === "비즈업_요약")!.data[0][0] = "2026년 6월 비즈업클래스 매출 요약";
  const service = second.sheets.find((item) => item.sheet === "비즈업_부가서비스")!;
  service.data.push(["", "박강사", "", "", "", 0]);
  second.sheets.find((item) => item.sheet === "비즈업_요약")!.data.push(["박강사"]);
  const result = analyzeWorkbooks([second, workbook()]);
  assert.deepEqual(result.monthlyAnalyses.map((item) => item.periodLabel), ["2026년 5월", "2026년 6월"]);
  const park = result.instructorResults.find((item) => item.instructor === "박강사")!;
  assert.equal(park.monthlySettlements[0].result.finalSettlement, 0);
});

test("DB에 저장한 월별 분석 스냅샷을 다시 합산해도 결과가 같다", () => {
  const may = analyzeWorkbook(workbook());
  const juneWorkbook = workbook({
    fileName: "비즈업클래스_26.06.xlsx",
    inputOrder: 1,
  });
  juneWorkbook.sheets.find(
    (item) => item.sheet === "비즈업_요약",
  )!.data[0][0] = "2026년 6월 비즈업클래스 매출 요약";
  const june = analyzeWorkbook(juneWorkbook);

  const fromWorkbooks = analyzeWorkbooks([juneWorkbook, workbook()]);
  const fromSnapshots = aggregateMonthlyAnalyses([june, may]);

  assert.deepEqual(fromSnapshots.totals, fromWorkbooks.totals);
  assert.deepEqual(fromSnapshots.instructorResults, fromWorkbooks.instructorResults);
  assert.equal(fromSnapshots.allMatched, fromWorkbooks.allMatched);
});

test("2차 정산서 골든 값을 정확히 계산한다", () => {
  const result = calculateStatement({
    a: 122_253_151, paymentType: "business",
    expenses: [
      { section: "B", name: "B", amount: 10_749_500 },
      { section: "C", name: "C", amount: 38_381_223 },
      { section: "D", name: "D", amount: 2_669_400 },
      { section: "E", name: "E", amount: 4_373_000 },
    ],
  });
  assert.deepEqual(
    [result.F, result.G, result.H, result.I, result.vat, result.JBusiness, result.withholding, result.JIndividual, result.K],
    [81_202_528, 40_601_264, 40_601_264, 36_228_264, 3_622_826, 39_851_090, 1_195_533, 35_032_731, 29_851_764],
  );
});

test("참여 강사 배분의 마지막 원 차이를 보정하고 붙여넣기 합계를 제외한다", () => {
  const exact = calculateStatement({
    a: 0, paymentType: "business", expenses: [{ section: "E", name: "조정", amount: -100_001 }],
    participants: [{ name: "A", sharePercent: 33.3 }, { name: "B", sharePercent: 33.3 }, { name: "C", sharePercent: 33.4 }],
  });
  assert.deepEqual(exact.participants.map((item) => item.amount), [36_630, 36_630, 36_741]);
  const pasted = parsePastedExpenses("광고\t(C)\t\t\t\n\t그룹\t\t\t\n\t\t소재비\t1,000원\t메모\n\t\t그룹 합계\t1,000원\t");
  assert.equal(pasted.length, 1);
  assert.equal(pasted[0].amount, 1000);
});

test("docs/비즈업클래스_26.06_v2.xlsx의 요약 8개와 실제 계산이 모두 일치한다", async () => {
  const sheets = await readXlsxFile("docs/비즈업클래스_26.06_v2.xlsx") as unknown as WorkbookInput["sheets"];
  const result = analyzeWorkbook({ fileName: "비즈업클래스_26.06_v2.xlsx", fileSize: 0, inputOrder: 0, sheets });
  assert.equal(result.periodLabel, "2026년 6월");
  assert.equal(result.instructorResults.length, 4);
  assert.equal(result.comparisons.filter((item) => item.matches).length, 8);
  assert.equal(result.totals.totalSales, 156_083_300);
  assert.equal(result.totals.settlementAmount, 132_020_874);
  assert.equal(result.totals.finalSettlement, 139_000_874);
});

test("회사·강사·공동 부담 비용을 원본 PDF 계산 순서로 반영한다", () => {
  const costs = [
    { id: "1", name: "회사비", burden: "company" as const, amount: 10_000 },
    { id: "2", name: "강사비", burden: "instructor" as const, amount: 20_000 },
    { id: "3", name: "공동비", burden: "shared" as const, amount: 100_000 },
  ].map((cost) => ({ ...cost, manager: "", occurredOn: "", note: "", evidenceRequired: false, evidenceType: "세금계산서" as const, evidenceNeedsReview: false, attachments: [] }));
  const result = calculateCostSettlement({ totalSales: 1_000_000, pgFee: 30_000, novaFee: 20_000, costs, instructorRatioPercent: 50 });
  assert.deepEqual({
    target: result.settlementTargetRevenue, distribution: result.distributionBase,
    instructorBase: result.instructorBase, companyBase: result.companyBase,
    supply: result.instructorSupply, vat: result.vat, instructorFinal: result.instructorFinal, companyFinal: result.companyFinal,
  }, { target: 950_000, distribution: 850_000, instructorBase: 425_000, companyBase: 425_000, supply: 405_000, vat: 40_500, instructorFinal: 445_500, companyFinal: 415_000 });
});

test("강사별 매출은 비즈업_요약 시트에 적힌 강사명만 집계한다", () => {
  const input = workbook();
  const toss = input.sheets.find((item) => item.sheet === "비즈업_토스")!;
  const excluded = Array(20).fill("") as Cell[];
  excluded[19] = "요약에 없는 강사";
  excluded[10] = 999_999;
  toss.data.push(excluded);

  const result = analyzeWorkbook(input);

  assert.deepEqual(result.instructorResults.map((item) => item.instructor), ["김강사"]);
  assert.equal(result.totals.totalSales, 220);
});

test("요약 강사명의 테스트·촬영용 항목은 집계에서 제외한다", () => {
  const input = workbook();
  const summary = input.sheets.find((item) => item.sheet === "비즈업_요약")!;
  summary.data.splice(2, 0, ["카메라테스트"], ["광고촬영"], ["test"]);

  const result = analyzeWorkbook(input);

  assert.deepEqual(result.instructorResults.map((item) => item.instructor), ["김강사"]);
});

test("전체 검증의 부가서비스 이용료는 강사명 예외 없이 모두 합산한다", () => {
  const input = workbook();
  const service = input.sheets.find((item) => item.sheet === "비즈업_부가서비스")!;
  service.data.push(["", "광고촬영", "촬영 지원", "", "", 100]);

  const result = analyzeWorkbook(input);

  assert.deepEqual(result.instructorResults.map((item) => item.instructor), ["김강사"]);
  assert.equal(result.instructorResults[0].additionalServiceFee, 6);
  assert.equal(result.totals.additionalServiceFee, 106);
  assert.equal(result.totals.settlementAmount, 63);
  assert.equal(result.totals.finalSettlement, 103);
});

test("요약의 쉼표 공동 강사명은 거래 시트의 x 표기와 연결한다", () => {
  const input = workbook();
  input.sheets.find((item) => item.sheet === "비즈업_요약")!.data[2][0] = "김강사,파트너";
  for (const [sheetName, column] of [["비즈업_토스", 19], ["비즈업_무통장", 8], ["비즈업_부가서비스", 1]] as const) {
    const sheet = input.sheets.find((item) => item.sheet === sheetName)!;
    for (const row of sheet.data.slice(1)) row[column] = "김강사x파트너";
  }

  const result = analyzeWorkbook(input);

  assert.equal(result.instructorResults[0].instructor, "김강사,파트너");
  assert.equal(result.instructorResults[0].totalSales, 220);
});

test("토스매출액이 없으면 Toss매출액 표기의 요약값을 검증한다", () => {
  const input = workbook();
  const summary = input.sheets.find((item) => item.sheet === "비즈업_요약")!;
  summary.data.push(["Toss매출액", 180]);

  const comparison = analyzeWorkbook(input).comparisons.find(
    (item) => item.key === "tossSales",
  );

  assert.equal(comparison?.summaryValue, 180);
  assert.equal(comparison?.matches, true);
});

test("공동비용의 강사 40% 계약 비율을 정산액에 반영한다", () => {
  const costs = [{
    id: "shared-60-40", name: "공동 광고비", burden: "shared" as const, amount: 100_000,
    companyShareAmount: 60_000, instructorShareAmount: 40_000,
    manager: "담당자", occurredOn: "2026-06-10", note: "", evidenceRequired: false,
    evidenceType: "세금계산서" as const, evidenceNeedsReview: false, attachments: [],
  }];
  const result = calculateCostSettlement({ totalSales: 1_000_000, pgFee: 0, novaFee: 0, costs, instructorRatioPercent: 50 });
  assert.equal(result.instructorSupply, 460_000);
  assert.equal(result.companyFinal, 440_000);
  assert.equal(result.costs.sharedInstructor, 40_000);
  assert.equal(result.costs.sharedCompany, 60_000);
});
