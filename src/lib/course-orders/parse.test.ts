import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import { buildCourseOrderPreview, COURSE_ORDER_HEADERS, courseOrderIdentity, parseCourseOrders, selectCourseOrders, splitCourseOrderProduct } from "./parse";
import { filterCourseOrders, summarizeCourseOrders } from "./filter";
import { EMPTY_ORDER_FILTERS } from "./types";

function matrix(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    주문항목명: "실전 AI-자동화 강의 - 기본반", 회원명: "수강생", 휴대전화번호: "010-1234-5678",
    이메일: "student@example.com", 결제금액: "1,200,000원", 환불금액: "200,000", "현 결제금액": 1000000,
    주문상태: "부분환불", 결제방법: "카드", RS: "강사", "트래킹 광고 매체": "유튜브",
    "트래킹 유입 구분": "광고", 결제ID: "payment-1", 환불일: "2026-09-12 09:10:00", ...overrides,
  };
  return [[...COURSE_ORDER_HEADERS], COURSE_ORDER_HEADERS.map((key) => values[key])];
}

test("요청한 열 전체를 보존하고 마지막 구분자의 오른쪽을 옵션으로 분리한다", () => {
  assert.deepEqual(parseCourseOrders(matrix())[0], {
    productName: "실전 AI-자동화 강의 - 기본반", optionName: "기본반", memberName: "수강생",
    phone: "01012345678", email: "student@example.com", paymentAmount: 1200000, refundAmount: 200000,
    currentAmount: 1000000, status: "부분환불", paymentMethod: "카드", rs: "강사", adMedia: "유튜브",
    inflowType: "광고", paymentId: "payment-1", orderId: "", refundDate: "2026-09-12",
  });
  assert.deepEqual(splitCourseOrderProduct("강의-프리미엄"), { courseName: "강의", optionName: "프리미엄" });
  assert.deepEqual(splitCourseOrderProduct("강의"), { courseName: "강의", optionName: "" });
  assert.deepEqual(splitCourseOrderProduct("강의 - 기본-추가"), { courseName: "강의", optionName: "기본-추가" });
});

test("열 공백·제목 행·숫자 전화번호·빈 환불일을 처리한다", () => {
  const input = matrix({ 휴대전화번호: 1012345678, 환불일: "", 환불금액: "" });
  input[0] = input[0].map((value) => String(value).replace(/\s/gu, ""));
  const [row] = parseCourseOrders([["내보낸 주문 목록"], ...input]);
  assert.equal(row.phone, "01012345678");
  assert.equal(row.refundDate, "");
  assert.equal(row.refundAmount, 0);
  assert.equal(parseCourseOrders(matrix({ 환불일: new Date("2026-09-12T00:00:00Z") }))[0].refundDate, "2026-09-12");
});

test("누락 열·잘못된 금액·날짜·식별자가 있으면 저장 전 오류를 낸다", () => {
  assert.throws(() => parseCourseOrders([["주문항목명"]]), /필수 열/);
  assert.throws(() => parseCourseOrders(matrix({ 결제금액: "금액 오류" })), /2행 결제금액/);
  assert.throws(() => parseCourseOrders(matrix({ 환불일: "2026-02-30" })), /2행 환불일/);
  assert.throws(() => parseCourseOrders(matrix({ 결제ID: "" })), /결제ID와 주문ID/);
  assert.throws(() => parseCourseOrders([matrix()[0]]), /주문 데이터가 없습니다/);
});

test("관련 상품 제안, 선택 범위, 동일 주문 중복 및 상충 데이터 검증", () => {
  const [first] = parseCourseOrders(matrix());
  const second = { ...first, productName: "다른 강의 - 기본반", paymentId: "p2" };
  const preview = buildCourseOrderPreview([first, second], "실전 AI-자동화 강의");
  assert.equal(preview.totalCount, 2);
  assert.deepEqual(preview.products.map((product) => product.suggested), [true, false]);
  assert.deepEqual(selectCourseOrders([first, first, second], [first.productName]), [first]);
  assert.throws(() => selectCourseOrders([first], ["없는 강의"]), /파일에 없는/);
  assert.throws(() => selectCourseOrders([first, { ...first, refundAmount: 0 }], [first.productName]), /서로 다른 결제 정보/);
});

test("범주·회원 검색·결제ID·금액·환불 날짜를 결합해 필터링하고 합계를 계산한다", () => {
  const [first] = parseCourseOrders(matrix());
  const other = { ...first, paymentId: "p2", rs: "", refundAmount: 0, refundDate: "", currentAmount: 1200000 };
  const rows = [first, other];
  assert.deepEqual(filterCourseOrders(rows, { ...EMPTY_ORDER_FILTERS, categories: { rs: "강사", adMedia: "유튜브", inflowType: "광고", optionName: "기본반", status: "부분환불", paymentMethod: "카드", productName: first.productName }, keyword: "STUDENT", refund: "refunded", refundFrom: "2026-09-12", refundTo: "2026-09-12", paymentMin: "1200000", paymentMax: "1200000", refundMin: "200000", refundMax: "200000", currentMin: "1000000", currentMax: "1000000" }), [first]);
  assert.deepEqual(filterCourseOrders(rows, { ...EMPTY_ORDER_FILTERS, categories: { rs: "" }, keyword: "p2", refund: "notRefunded" }), [other]);
  assert.equal(filterCourseOrders(rows, { ...EMPTY_ORDER_FILTERS, refundFrom: "2026-09-13" }).length, 0);
  assert.deepEqual(summarizeCourseOrders(rows), { count: 2, paymentAmount: 2400000, refundAmount: 200000, currentAmount: 2200000 });
  assert.deepEqual(summarizeCourseOrders([]), { count: 0, paymentAmount: 0, refundAmount: 0, currentAmount: 0 });
});

const samplePath = "docs/purchase_order_20260912.xlsx";
test("실제 엑셀의 분할결제를 주문번호로 통합하고 모든 상품을 오류 없이 선택한다", { skip: !existsSync(samplePath) }, async () => {
  const sheet = await readSheet(samplePath, 1);
  const rows = parseCourseOrders(sheet as unknown[][]);
  assert.equal(sheet.length - 1, 120);
  assert.equal(rows.length, 115);
  assert.equal(rows.filter((row) => row.splitOrderNumber).length, 4);
  for (const [field, index] of [["paymentAmount", 6], ["refundAmount", 7], ["currentAmount", 9]] as const) {
    assert.equal(rows.reduce((total, row) => total + row[field], 0), sheet.slice(1).reduce((total, row) => total + Number(row[index]), 0));
  }
  const preview = buildCourseOrderPreview(rows, "AI와 채팅해서 월1,000만원 버는 실전 수익화 퍼널 클래스");
  assert.equal(preview.products.reduce((sum, product) => sum + product.count, 0), 115);
  assert.equal(selectCourseOrders(rows, preview.products.map((product) => product.name)).length, 115);
  const selected = selectCourseOrders(rows, preview.products.filter((product) => product.suggested).map((product) => product.name));
  assert.ok(selected.length > 0 && selected.length < rows.length);
  assert.ok(selected.every((row) => ["기본반", "프리미엄반"].includes(row.optionName)));
});

function splitMatrix(items: Array<Record<string, unknown>>) {
  return [
    [...COURSE_ORDER_HEADERS, "결제유형", "주문번호", "주문ID"],
    ...items.map((item) => [...matrix(item)[1], item.결제유형 ?? "분할결제", item.주문번호 ?? "ORDER-1", item.주문ID ?? "order-id"]),
  ];
}

test("분할결제 금액·환불을 합산하고 결제ID·방법을 보존하며 재업로드 식별자는 일정하다", () => {
  const first = { 결제ID: "p1", 결제금액: 1000000, 환불금액: 100000, "현 결제금액": 900000, 결제방법: "카드", 환불일: "2026-09-10" };
  const second = { 결제ID: "p2", 주문ID: "another-id", 결제금액: 500000, 환불금액: 50000, "현 결제금액": 450000, 결제방법: "계좌이체", 환불일: "2026-09-12" };
  const [merged] = parseCourseOrders(splitMatrix([first, second, first]));
  assert.equal(merged.paymentAmount, 1500000);
  assert.equal(merged.refundAmount, 150000);
  assert.equal(merged.currentAmount, 1350000);
  assert.equal(merged.paymentId, "p1 / p2");
  assert.equal(merged.paymentMethod, "계좌이체 / 카드");
  assert.equal(merged.refundDate, "2026-09-12");
  assert.equal(selectCourseOrders([merged], [merged.productName]).length, 1);
  assert.equal(buildCourseOrderPreview([merged], "실전").totalCount, 1);
  const [reversed] = parseCourseOrders(splitMatrix([second, first]));
  assert.deepEqual(merged, reversed);
  const [single] = parseCourseOrders(splitMatrix([first]));
  assert.equal(courseOrderIdentity(single), courseOrderIdentity(merged));
});

test("주문번호가 다른 분할결제와 일반결제는 합치지 않고 잘못된 분할결제는 오류를 낸다", () => {
  const rows = parseCourseOrders(splitMatrix([{ 결제ID: "p1" }, { 결제ID: "p2", 주문번호: "ORDER-2" }, { 결제ID: "p3", 결제유형: "일괄결제" }]));
  assert.equal(rows.length, 3);
  assert.equal(selectCourseOrders(rows, [rows[0].productName]).length, 3);
  assert.throws(() => parseCourseOrders(splitMatrix([{ 주문번호: "" }])), /주문번호가 비어/);
  assert.throws(() => parseCourseOrders(splitMatrix([{ 결제ID: "same" }, { 결제ID: "same", 결제금액: 100 }])), /같은 분할결제의 결제ID/);
  const regular = parseCourseOrders(splitMatrix([{ 결제ID: "p1", 결제유형: "일괄결제" }, { 결제ID: "p2", 결제유형: "일괄결제" }]));
  assert.throws(() => selectCourseOrders(regular, [regular[0].productName]), /서로 다른 결제 정보/);
});
