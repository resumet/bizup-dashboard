import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePurchaseOrders,
  parsePurchaseOrderRows,
  PURCHASE_ORDER_HEADERS,
  splitPurchaseProductName,
} from "./analysis";

function makeRow(values: Partial<Record<(typeof PURCHASE_ORDER_HEADERS)[number], unknown>>) {
  return PURCHASE_ORDER_HEADERS.map((header) => values[header] ?? "");
}

test("주문 원장의 금액·환불·순매출과 고유 주문 건수를 계산한다", () => {
  const rows = parsePurchaseOrderRows([
    [...PURCHASE_ORDER_HEADERS],
    makeRow({
      주문항목명: "(추가결제) AI 강의 - 프리미엄반",
      회원명: "홍길동",
      이메일: "hong@example.com",
      결제금액: 400,
      환불금액: 0,
      "현 결제금액": 400,
      주문상태: "결제완료",
      주문번호: "ORDER-1",
      결제일시: "2026-08-01 10:00:00",
      결제방법: "신용카드",
    }),
    makeRow({
      주문항목명: "AI 강의 - 프리미엄반",
      회원명: "홍길동",
      이메일: "hong@example.com",
      결제금액: 600,
      환불금액: 0,
      "현 결제금액": 600,
      주문상태: "결제완료",
      주문번호: "ORDER-1",
      결제일시: "2026-08-01 10:00:00",
      결제방법: "신용카드",
    }),
    makeRow({
      주문항목명: "AI 강의 - 기본반",
      회원명: "홍길동",
      이메일: "hong@example.com",
      결제금액: 500,
      환불금액: 200,
      "현 결제금액": 300,
      주문상태: "부분환불",
      주문번호: "ORDER-2",
      결제일시: "2026-08-02 10:00:00",
      결제방법: "가상계좌",
    }),
    makeRow({
      주문항목명: "테스트 강의",
      결제금액: 999999,
      "현 결제금액": 999999,
      주문번호: "TEST",
    }),
  ]);
  const analysis = analyzePurchaseOrders(rows);

  assert.equal(rows.length, 3);
  assert.equal(analysis.totals.orderCount, 2);
  assert.equal(analysis.totals.paymentAmount, 1500);
  assert.equal(analysis.totals.refundAmount, 200);
  assert.equal(analysis.totals.currentAmount, 1300);
  assert.equal(analysis.totals.partialRefundCount, 1);
  assert.equal(analysis.repeatCustomers[0].purchaseCount, 2);
  assert.equal(analysis.courses[0].name, "AI 강의");
  assert.equal(analysis.courses[0].count, 2);
});

test("판매용 접두어와 추가결제용 접미어를 제거하고 옵션을 분리한다", () => {
  assert.deepEqual(
    splitPurchaseProductName("(기존수강생용) 옥구슬언니 - 호스텔 (추가결제용)"),
    {
      productName: "옥구슬언니 - 호스텔",
      courseName: "옥구슬언니",
      optionName: "호스텔",
    },
  );
});

test("중복 구매자 계산에서 전액 환불 주문을 제외한다", () => {
  const rows = parsePurchaseOrderRows([
    [...PURCHASE_ORDER_HEADERS],
    makeRow({
      주문항목명: "AI 강의 - 기본반",
      회원명: "환불제외",
      이메일: "refund@example.com",
      결제금액: 500,
      환불금액: 0,
      "현 결제금액": 500,
      주문상태: "결제완료",
      주문번호: "ORDER-ACTIVE",
    }),
    makeRow({
      주문항목명: "마케팅 강의 - 기본반",
      회원명: "환불제외",
      이메일: "refund@example.com",
      결제금액: 700,
      환불금액: 700,
      "현 결제금액": 0,
      주문상태: "환불",
      주문번호: "ORDER-REFUNDED",
    }),
    makeRow({
      주문항목명: "AI 강의 - 심화반",
      회원명: "부분환불유지",
      이메일: "partial@example.com",
      결제금액: 600,
      환불금액: 100,
      "현 결제금액": 500,
      주문상태: "부분환불",
      주문번호: "ORDER-PARTIAL",
    }),
    makeRow({
      주문항목명: "마케팅 강의 - 심화반",
      회원명: "부분환불유지",
      이메일: "partial@example.com",
      결제금액: 800,
      환불금액: 0,
      "현 결제금액": 800,
      주문상태: "결제완료",
      주문번호: "ORDER-SECOND",
    }),
  ]);

  const analysis = analyzePurchaseOrders(rows);

  assert.equal(
    analysis.repeatCustomers.some((customer) => customer.email === "refund@example.com"),
    false,
  );
  assert.equal(analysis.repeatCustomers.length, 1);
  assert.equal(analysis.repeatCustomers[0].email, "partial@example.com");
  assert.equal(analysis.repeatCustomers[0].purchaseCount, 2);
  assert.equal(analysis.repeatCustomers[0].currentAmount, 1300);
});
