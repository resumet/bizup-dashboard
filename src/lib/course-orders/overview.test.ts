import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCourseOrderOverview } from "./filter";
import type { CourseOrder } from "./types";

function order(status: string, paymentAmount: number, currentAmount: number, refundAmount = 0): CourseOrder {
  return { productName: "강의", optionName: "기본반", memberName: "테스트", phone: "", email: "",
    paymentAmount, currentAmount, refundAmount, status, paymentMethod: "", rs: "", adMedia: "",
    inflowType: "", paymentId: "", orderId: "", refundDate: "" };
}

test("전체 주문 요약은 상태별 건수와 원본 금액을 집계하고 부분환불·분할결제를 포함한다", () => {
  const rows = [
    order(" 결제완료 ", 1000, 1000), order("입금 대기", 500, 0),
    order("결제완료 / 입금대기", 700, 200), order("부분환불", 1000, 800, 200),
    order("전액환불", 300, 0, 300), order("입금대기취소", 900, 0),
    order("환불대기", 200, 200),
  ];
  assert.deepEqual(summarizeCourseOrderOverview(rows), { count: 7, completedCount: 1,
    awaitingDepositCount: 2, refundedCount: 2, currentAmount: 2200, awaitingDepositAmount: 1200, refundAmount: 500 });
});

test("환불 상태·금액·날짜 중 하나가 있으면 환불 건수에 한 번만 포함한다", () => {
  const rows = [order("환불완료", 100, 0), order("처리완료", 100, 50, 50),
    { ...order("처리완료", 100, 0), refundDate: "2026-09-16" },
    order("입금대기 / 부분환불", 100, 0, 10), order("환불취소", 100, 100)];
  const summary = summarizeCourseOrderOverview(rows);
  assert.equal(summary.refundedCount, 4);
  assert.equal(summary.awaitingDepositCount, 1);
  assert.equal(summary.refundAmount, 60);
});

test("빈 명단과 소수 금액을 정확하게 표시할 수 있도록 집계한다", () => {
  assert.deepEqual(summarizeCourseOrderOverview([]), { count: 0, completedCount: 0,
    awaitingDepositCount: 0, refundedCount: 0, currentAmount: 0, awaitingDepositAmount: 0, refundAmount: 0 });
  const summary = summarizeCourseOrderOverview([order("입금대기", 0.1, 0.1, 0.1), order("입금대기", 0.2, 0.2, 0.2)]);
  assert.equal(summary.currentAmount, 0.3);
  assert.equal(summary.awaitingDepositAmount, 0.3);
  assert.equal(summary.refundAmount, 0.3);
});
