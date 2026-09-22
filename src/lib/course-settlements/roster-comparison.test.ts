import assert from "node:assert/strict";
import test from "node:test";
import type { SavedCourseOrder } from "@/lib/course-orders/types";
import type { InstructorSourceDetails, MonthlyAnalysis } from "./engine";
import { compareSettlementRoster } from "./roster-comparison";
import { comparisonWindowHtml } from "./roster-comparison-window";

const order = (overrides: Partial<SavedCourseOrder> = {}): SavedCourseOrder => ({ id: "order", updatedAt: "", productName: "강의", optionName: "", memberName: "홍길동", phone: "010-1234-5678", email: "", paymentAmount: 100, refundAmount: 0, currentAmount: 100, status: "결제완료", paymentMethod: "카드", rs: "", adMedia: "", inflowType: "", paymentId: "홍길동", refundDate: "", orderId: "", ...overrides });
const toss = (buyer: string, amount: number): InstructorSourceDetails["toss"][number] => ({ orderNumber: buyer.replace(/\s/g, ""), buyer, amount, date: "2026-09-01", paymentMethod: "카드", status: amount < 0 ? "취소" : "승인", agency: "", pgFee: 0, supplyAmount: 0, vat: 0, acquiringStatus: "" });
const month = (details: Partial<InstructorSourceDetails>): MonthlyAnalysis => ({ fileName: "9월.xlsx", fileSize: 1, inputOrder: 0, periodLabel: "9월", periodYear: 2026, periodMonth: 9, summaryTitle: "", hasCashSheet: true, instructorResults: [], totals: {} as MonthlyAnalysis["totals"], comparisons: [], allMatched: true, detailsByInstructor: { 강사: { toss: [], cash: [], service: [], ...details } } });

test("양방향 ID 누락과 금액 차이 및 원본 중복 보존", () => {
  const result = compareSettlementRoster([order(), order({ memberName: "주문전용", paymentId: "주문전용" }), order({ memberName: "차이", paymentId: "차이" })], [month({ toss: [toss("홍 길동", 70), toss("홍길동", 30), toss("정산전용", 100), toss("차이", 90)] })], "강사");
  assert.equal(result.find(row => row.name === "홍길동")?.status, "matched");
  assert.equal(result.find(row => row.name === "홍길동")?.settlements.length, 2);
  assert.equal(result.find(row => row.name === "주문전용")?.status, "orders-only");
  assert.equal(result.find(row => row.name === "정산전용")?.status, "settlement-only");
  assert.equal(result.find(row => row.name === "차이")?.status, "different");
});
test("토스 취소와 무통장 음수 취소를 누적 엔진과 같은 부호로 합산", () => {
  const result = compareSettlementRoster([order({ paymentAmount: 200, refundAmount: 70, currentAmount: 130 })], [month({ toss: [toss("홍길동", 100), toss("홍길동", -20)], cash: [{ buyer: "홍길동", date: "", email: "", phone: "01012345678", paymentAmount: 100, cancellationAmount: -50, lectureName: "강의" }] })], "강사")[0];
  assert.equal(result.status, "different");
  assert.deepEqual(result.settlementTotal, { payment: 100, refund: 20, net: 80 });
});
test("잔액만 같은 서로 다른 결제·환불 합계는 일치로 처리하지 않는다", () => {
  const result = compareSettlementRoster([order({ paymentAmount: 200, refundAmount: 100 })], [month({ toss: [toss("홍길동", 100)] })], "강사");
  assert.equal(result[0].status, "different");
});
test("서로 다른 월의 결제와 환불을 누적하고 각 원본을 보존한다", () => {
  const first = month({ toss: [toss("홍길동", 100)] });
  const second = { ...month({ toss: [toss("홍길동", -30)] }), fileName: "10월.xlsx", periodLabel: "10월" };
  const [result] = compareSettlementRoster([order({ refundAmount: 30, currentAmount: 70 })], [first, second], "강사");
  assert.equal(result.status, "matched");
  assert.equal(result.settlementTotal.net, 70);
  assert.deepEqual(result.settlements.map(row => row.source), ["9월 · 9월.xlsx", "10월 · 10월.xlsx"]);
});
test("동명이인 연락처 충돌과 이름 없는 거래를 자동 일치시키지 않는다", () => {
  const result = compareSettlementRoster([order(), order({ phone: "01099999999" }), order({ memberName: "", paymentId: "" })], [month({ toss: [toss("홍길동", 200), toss("", 100)] })], "강사");
  assert.equal(result.find(row => row.name === "홍길동")?.status, "review");
  assert.deepEqual(result.filter(row => row.name === "이름 없음").map(row => row.status).sort(), ["review", "review"]);
});
test("다른 강사·부가서비스는 명단에서 제외하고 빈 상태와 HTML 이스케이프를 지원", () => {
  assert.deepEqual(compareSettlementRoster([], [month({ toss: [toss("홍길동", 100)] })], "다른강사"), []);
  const result = compareSettlementRoster([order({ memberName: '<script>alert(1)</script>' })], [], "강사");
  const html = comparisonWindowHtml('<img src=x onerror=alert(1)>', "강사", result);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.deepEqual(compareSettlementRoster([], [month({ service: [{ serviceName: "광고", date: "", otherCost: 0, total: 100, note: "" }] })], "강사"), []);
});

test("동명이인도 ID가 다르면 분리하고 다른 이름도 ID가 같으면 연결", () => {
  const result = compareSettlementRoster([order({paymentId:"A"}),order({paymentId:"B"})], [month({toss:[{...toss("다른이름",100),orderNumber:"A"},{...toss("홍길동",90),orderNumber:"B"}]})], "강사");
  assert.equal(result.length,2);
  assert.equal(result.find(row=>row.paymentId==="A")?.status,"matched");
  assert.equal(result.find(row=>row.paymentId==="B")?.status,"different");
});
test("분할결제의 여러 ID는 금액을 중복 합산하지 않는다", () => {
  const [result] = compareSettlementRoster([order({paymentId:"001 / 002",paymentAmount:200,currentAmount:200})],[month({toss:[{...toss("홍길동",100),orderNumber:"001"},{...toss("홍길동",100),orderNumber:"002"}]})],"강사");
  assert.equal(result.status,"matched");
  assert.equal(result.orderTotal.net,200);
});
test("가상계좌 입금대기는 정산 비교에서 제외한다", () => {
  const result=compareSettlementRoster([order({paymentId:"pending",paymentMethod:"가상 계좌",status:"입금 대기"}),order({paymentId:"paid",paymentMethod:"가상계좌"}),order({paymentId:"card",status:"입금대기"})],[],"강사");
  assert.deepEqual(result.map(row=>row.paymentId).sort(),["card","paid"]);
});

test("가상계좌 전액환불만 제외하고 카드 전액환불과 가상계좌 부분환불은 유지한다", () => {
  const result = compareSettlementRoster([
    order({ paymentId: "excluded", paymentMethod: "가상 계좌", status: "전액 환불", refundAmount: 100, currentAmount: 0 }),
    order({ paymentId: "card", paymentMethod: "카드", status: "전액환불", refundAmount: 100, currentAmount: 0 }),
    order({ paymentId: "partial", paymentMethod: "가상계좌", status: "부분환불", refundAmount: 50, currentAmount: 50 }),
    order({ paymentId: "paid", paymentMethod: "가상계좌", status: "결제완료" }),
  ], [], "강사");
  assert.deepEqual(result.map(row => row.paymentId).sort(), ["card", "paid", "partial"]);
});
