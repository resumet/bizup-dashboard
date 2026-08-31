import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSettlements,
  normalizeSettlementCourseName,
  parseSettlementRows,
  SETTLEMENT_HEADERS,
} from "./analysis";

test("정산 엑셀 행을 파싱하고 전체·강사·중복 결제를 집계한다", () => {
  const makeRow = (
    values: Partial<Record<(typeof SETTLEMENT_HEADERS)[number], unknown>>,
  ) => SETTLEMENT_HEADERS.map((header) => values[header] ?? "");
  const rows = parseSettlementRows([
    [...SETTLEMENT_HEADERS],
    makeRow({
      강의명: "A",
      강사명: "김강사",
      회원명: "홍길동",
      이메일: "A@EXAMPLE.COM",
      매출금액: 100000,
      "PG사 수수료": 3000,
      "노바 수수료금액": 10000,
      정산금액: 87000,
      할부개월수: "일시불",
      결제수단: "카드",
      매출일: "2026-08-01",
    }),
    makeRow({
      강의명: "B",
      강사명: "김강사",
      회원명: "홍길동",
      이메일: "a@example.com",
      매출금액: 200000,
      "PG사 수수료": 6000,
      "노바 수수료금액": 20000,
      정산금액: 174000,
      할부개월수: "3개월",
      결제수단: "카드",
      매출일: "2026.08.02",
    }),
  ]);
  const result = analyzeSettlements(rows);
  assert.equal(result.totals.salesAmount, 300000);
  assert.equal(result.totals.pgFee, 9000);
  assert.equal(result.instructors[0].name, "김강사");
  assert.equal(result.paymentMethods[0].name, "카드");
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].purchaseCount, 2);
  assert.equal(result.duplicates[0].salesAmount, 300000);
  assert.deepEqual(result.duplicates[0].courses, ["A", "B"]);
  assert.deepEqual(
    result.trend.map((item) => item.name),
    ["2026-08-01", "2026-08-02"],
  );
});

test("중복 결제는 고유 주문번호로 세고 매출금액을 합산한다", () => {
  const makeRow = ({
    memberName,
    email,
    orderNumber,
    paymentAmount,
    salesAmount,
  }: {
    memberName: string;
    email: string;
    orderNumber: string;
    paymentAmount: number;
    salesAmount: number;
  }) =>
    SETTLEMENT_HEADERS.map((header) => {
      if (header === "강의명") return "A 강의";
      if (header === "강사명") return "김강사";
      if (header === "회원명") return memberName;
      if (header === "이메일") return email;
      if (header === "주문번호") return orderNumber;
      if (header === "결제금액") return paymentAmount;
      if (header === "매출금액") return salesAmount;
      return "";
    });

  const rows = parseSettlementRows([
    [...SETTLEMENT_HEADERS],
    makeRow({
      memberName: "홍길동",
      email: "hong@example.com",
      orderNumber: "ORDER-1",
      paymentAmount: 1000,
      salesAmount: 400,
    }),
    makeRow({
      memberName: "홍길동",
      email: "hong@example.com",
      orderNumber: "ORDER-1",
      paymentAmount: 1000,
      salesAmount: 600,
    }),
    makeRow({
      memberName: "홍길동",
      email: "hong@example.com",
      orderNumber: "ORDER-2",
      paymentAmount: 1000,
      salesAmount: 1000,
    }),
    makeRow({
      memberName: "김영희",
      email: "kim@example.com",
      orderNumber: "ORDER-3",
      paymentAmount: 2000,
      salesAmount: 1000,
    }),
    makeRow({
      memberName: "김영희",
      email: "kim@example.com",
      orderNumber: "ORDER-3",
      paymentAmount: 2000,
      salesAmount: 1000,
    }),
  ]);
  const result = analyzeSettlements(rows);

  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].name, "홍길동");
  assert.equal(result.duplicates[0].purchaseCount, 2);
  assert.equal(result.duplicates[0].salesAmount, 2000);
});

test("필수 정산 열이 없으면 누락된 헤더를 안내한다", () => {
  assert.throws(
    () => parseSettlementRows([["강의명"], ["A"]]),
    /필수 열이 없습니다/,
  );
});

test("주문상태가 환불인 행은 제외하고 부분환불은 집계한다", () => {
  const makeRow = (orderStatus: string, salesAmount: number) =>
    SETTLEMENT_HEADERS.map((header) => {
      if (header === "강의명") return "A 강의";
      if (header === "강사명") return "김강사";
      if (header === "주문상태") return orderStatus;
      if (header === "매출금액") return salesAmount;
      if (header === "정산금액") return salesAmount;
      return "";
    });

  const rows = parseSettlementRows([
    [...SETTLEMENT_HEADERS],
    makeRow("결제완료", 1000),
    makeRow("부분환불", 600),
    makeRow("환불", -1000),
  ]);
  const result = analyzeSettlements(rows);

  assert.equal(rows.length, 2);
  assert.equal(result.totals.salesAmount, 1600);
  assert.deepEqual(rows.map((row) => row.orderStatus), ["결제완료", "부분환불"]);
});

test("판매 구분 접두어를 제거해 같은 강의로 집계하고 테스트 강의는 제외한다", () => {
  const makeRow = (
    course: string,
    salesAmount: number,
  ) =>
    SETTLEMENT_HEADERS.map((header) => {
      if (header === "강의명") return course;
      if (header === "강사명") return "김강사";
      if (header === "매출금액") return salesAmount;
      if (header === "정산금액") return salesAmount;
      return "";
    });

  const rows = parseSettlementRows([
    [...SETTLEMENT_HEADERS],
    makeRow("클릭 몇번에 방구석 억대매출 올린 광고중개 부업", 100),
    makeRow("(추가결제) 클릭 몇번에 방구석 억대매출 올린 광고중개 부업", 200),
    makeRow("(추가결제2) 클릭 몇번에 방구석 억대매출 올린 광고중개 부업", 300),
    makeRow("(기수강생용) 세아이 엄마의 에어비앤비 비밀공식", 400),
    makeRow("(개강후결제) 세아이 엄마의 에어비앤비 비밀공식", 500),
    makeRow("테스트 강의", 999999),
  ]);
  const result = analyzeSettlements(rows);

  assert.equal(rows.length, 5);
  assert.equal(result.totals.salesAmount, 1500);
  assert.deepEqual(
    result.courses.map((course) => [course.name, course.count, course.salesAmount]),
    [
      ["세아이 엄마의 에어비앤비 비밀공식", 2, 900],
      ["클릭 몇번에 방구석 억대매출 올린 광고중개 부업", 3, 600],
    ],
  );
  assert.equal(
    normalizeSettlementCourseName("（ 기존수강생용 ）  AI 강의"),
    "AI 강의",
  );
});
