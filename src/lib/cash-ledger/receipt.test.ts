import assert from "node:assert/strict";
import test from "node:test";
import { normalizePartyName, receiptAnalysis, receiptImageType, type ReceiptExtraction } from "./receipt";

const approval: ReceiptExtraction = { status: "approved", transactionCount: 1, amount: 200000, currency: "KRW", merchantName: "주식회사 앤스페이스", year: null, month: 10, day: 19 };
const now = new Date("2026-10-19T05:01:00Z");

test("카드 승인 예시를 지출·10/19·200,000원·주식회사 앤스페이스로 변환하고 제목은 만들지 않는다", () => {
  assert.deepEqual(receiptAnalysis(approval, now), { kind: "expense", amount: 200000, entryDate: "2026-10-19", partyName: "주식회사 앤스페이스", yearInferred: true });
});

test("연도 없는 날짜는 한국 현재 연도를 사용하고 이미지에 있는 연도는 보존한다", () => {
  assert.equal(receiptAnalysis(approval, new Date("2026-12-31T16:00:00Z")).entryDate, "2027-10-19");
  assert.deepEqual(receiptAnalysis({ ...approval, year: 2024, month: 2, day: 29 }, now), { kind: "expense", amount: 200000, entryDate: "2024-02-29", partyName: approval.merchantName, yearInferred: false });
  for (const changes of [{ year: 2026, month: 2, day: 29 }, { month: null }, { day: null }, { month: 13 }, { month: 4, day: 31 }, { year: 1999 }, { year: 2101 }]) {
    assert.throws(() => receiptAnalysis({ ...approval, ...changes }, now), /날짜/);
  }
});

test("승인 취소·불명확한 이미지·여러 거래·외화는 지출로 입력하지 않는다", () => {
  assert.throws(() => receiptAnalysis({ ...approval, status: "canceled" }, now), /승인 취소/);
  assert.throws(() => receiptAnalysis({ ...approval, status: "unknown" }, now), /찾지 못했/);
  assert.throws(() => receiptAnalysis({ ...approval, transactionCount: 0 }, now), /찾지 못했/);
  assert.throws(() => receiptAnalysis({ ...approval, transactionCount: 2 }, now), /여러 건/);
  for (const currency of ["USD", null]) assert.throws(() => receiptAnalysis({ ...approval, currency }, now), /원화/);
});

test("없는 금액·음수·소수·초과 금액이나 지급대상은 추측하지 않는다", () => {
  for (const amount of [null, 0, -200000, 200000.5, 1000000000001, NaN]) assert.throws(() => receiptAnalysis({ ...approval, amount }, now), /승인 금액/);
  for (const merchantName of [null, "  ", "가".repeat(121)]) assert.throws(() => receiptAnalysis({ ...approval, merchantName }, now), /가맹점명/);
});

test("거래처 이름은 공백만 정리하고 카드사명이나 다른 회사로 바꾸지 않는다", () => {
  assert.equal(receiptAnalysis({ ...approval, merchantName: " 주식회사  앤스페이스 " }, now).partyName, "주식회사 앤스페이스");
  assert.equal(normalizePartyName("주식회사 앤스페이스"), normalizePartyName("주식회사앤스페이스"));
  assert.notEqual(normalizePartyName("앤스페이스"), normalizePartyName("앤스페이스 강남점"));
});

test("분석은 4MB 이하 이미지만 허용하고 PDF·위장 파일은 거부한다", () => {
  assert.equal(receiptImageType({ name: "clipboard.png", type: "image/png", size: 100 }).mime, "image/png");
  assert.throws(() => receiptImageType({ name: "receipt.pdf", type: "application/pdf", size: 100 }), /이미지/);
  assert.throws(() => receiptImageType({ name: "image.png", type: "image/png", size: 4194305 }), /4 MB/);
  assert.throws(() => receiptImageType({ name: "image.png", type: "text/html", size: 100 }));
});
