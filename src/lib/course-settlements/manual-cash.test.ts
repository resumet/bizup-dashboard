import assert from "node:assert/strict";
import test from "node:test";
import type { RosterRow } from "@/lib/jobs/types";
import { summarizeManualCash } from "./manual-cash";
import { calculateCostSettlement } from "./engine";

function row(id: string, values: Partial<RosterRow["values"]> = {}, flags: Partial<RosterRow> = {}): RosterRow {
  return {
    id, sourceRowNumber: 1, normalizedPhone: "", isDuplicate: false, groupChatJoined: false,
    isExtraParticipant: false, isManuallyAdded: true, memo: "", ...flags,
    values: { customerName: "수강생", phone: "", email: "", courseName: "강의", optionName: "", referrer: "", source: "", adMedia: "", paymentMethod: "현금결제", paymentAmount: "100,000", ...values },
  };
}

test("수동 현금은 결제별 금액을 합산하고 동일 연락처의 인원은 한 번만 센다", () => {
  assert.deepEqual(summarizeManualCash([
    row("a", { phone: "010-1234-5678", paymentAmount: "100000.10" }),
    row("b", { phone: "+82 10 1234 5678", paymentAmount: "200000.20" }),
    row("c"),
  ]), { payerCount: 2, paymentCount: 3, amount: 400000.3 });
});

test("원본 주문·환불·추가 참여자·다른 결제방법·무료 내역은 가산하지 않는다", () => {
  assert.deepEqual(summarizeManualCash([
    row("imported", {}, { isManuallyAdded: false }),
    row("refunded", { refundedAt: "2026-10-15" } as Partial<RosterRow["values"]>),
    row("extra", {}, { isExtraParticipant: true }),
    row("card", { paymentMethod: "신용카드" }),
    row("virtual", { paymentMethod: "가상계좌" }),
    row("free", { paymentAmount: "0" }),
    row("empty", { paymentAmount: "" }),
  ]), { payerCount: 0, paymentCount: 0, amount: 0 });
  assert.deepEqual(summarizeManualCash([]), { payerCount: 0, paymentCount: 0, amount: 0 });
});

test("잘못된 현금 금액을 0원으로 숨기지 않는다", () => {
  assert.throws(() => summarizeManualCash([row("invalid", { paymentAmount: "잘못된 금액" })]), /결제금액/);
});

test("현금 가산과 부가서비스 차감은 분배·부가세 계산 전에 각각 한 번 적용된다", () => {
  const result = calculateCostSettlement({ totalSales: 1_000_000, manualCashSales: 200_000,
    pgFee: 30_000, novaFee: 20_000, additionalServiceFee: 50_000, costs: [], instructorRatioPercent: 50 });
  assert.equal(result.totalSales, 1_200_000);
  assert.equal(result.totalFee, 100_000);
  assert.equal(result.settlementTargetRevenue, 1_100_000);
  assert.equal(result.instructorSupply, 550_000);
  assert.equal(result.vat, 55_000);
  assert.equal(result.instructorFinal, 605_000);
  assert.equal(result.companyFinal, 550_000);
});
