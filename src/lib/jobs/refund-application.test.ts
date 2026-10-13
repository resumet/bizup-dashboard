import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { refundApplicantSignature, refundApplicationAmount, refundApplicationDate, refundApplicationFilename, refundApplicationRows, refundApplicationSchema } from "./refund-application";
import { createRefundApplicationPdf } from "./refund-application-pdf";

const input = {
  name: "홍길동", phone: "010-1234-5678", email: "student@example.com", courseName: "온라인 강의",
  paymentAmount: "1,250,000", refundRate: "33.33", date: "2026-10-13",
  reason: "B", reasonDetail: "",
};

test("refund application validates required fields and preserves zero rates and payments", () => {
  assert.equal(refundApplicationSchema.parse(input).paymentAmount, "1250000");
  for (const key of Object.keys(input).filter((key) => key !== "reasonDetail")) {
    assert.equal(refundApplicationSchema.safeParse({ ...input, [key]: "" }).success, false, key);
  }
  for (const refundRate of ["-1", "101", "1e2", "NaN", "0.001"]) {
    assert.equal(refundApplicationSchema.safeParse({ ...input, refundRate }).success, false, refundRate);
  }
  for (const paymentAmount of ["-1", "12.50", "abc", "99999999999999"]) {
    assert.equal(refundApplicationSchema.safeParse({ ...input, paymentAmount }).success, false, paymentAmount);
  }
  assert.equal(refundApplicationSchema.safeParse({ ...input, refundRate: "0", paymentAmount: "0" }).success, true);
  assert.equal(refundApplicationSchema.safeParse({ ...input, refundRate: "100" }).success, true);
  assert.equal(refundApplicationSchema.safeParse({ ...input, date: "2026-02-30" }).success, false);
  assert.equal(refundApplicationSchema.safeParse({ ...input, email: "invalid" }).success, false);
  assert.equal(refundApplicationSchema.safeParse({ ...input, phone: "not a phone" }).success, false);
  assert.equal(refundApplicationSchema.safeParse({ ...input, name: "홍\n길동" }).success, false);
});

test("reason must be one of A–D, and other reasons require details", () => {
  for (const reason of ["A", "B", "C"]) assert.equal(refundApplicationSchema.safeParse({ ...input, reason }).success, true);
  for (const reason of ["", "E", "AB", "기타"]) assert.equal(refundApplicationSchema.safeParse({ ...input, reason }).success, false);
  assert.equal(refundApplicationSchema.safeParse({ ...input, reason: "D", reasonDetail: "  " }).success, false);
  assert.equal(refundApplicationSchema.parse({ ...input, reason: "D", reasonDetail: "  중복 결제  " }).reasonDetail, "중복 결제");
});

test("signature spaces each name character and appends the seal mark", () => {
  assert.equal(refundApplicantSignature("홍길동"), "홍  길  동   (인)");
  assert.equal(refundApplicantSignature(" 홍  길 동 "), "홍  길  동   (인)");
  assert.equal(refundApplicantSignature("남궁민수"), "남  궁  민  수   (인)");
});

test("document fields use Korean formatting and filename excludes path separators", () => {
  assert.deepEqual(refundApplicationRows(input), [
    ["이름", "홍길동"], ["전화번호", "010-1234-5678"], ["이메일 주소", "student@example.com"],
    ["강의명", "온라인 강의"], ["결제금액", "1,250,000원"], ["환불율", "33.33%"], ["날짜", "2026년 10월 13일"],
  ]);
  assert.equal(refundApplicationFilename({ ...input, name: "홍/길\\동" }), "환불신청서_홍_길_동_2026-10-13.pdf");
  assert.equal(refundApplicationDate(new Date("2026-10-12T15:01:00Z")), "2026-10-13");
});

test("refund amount matches the sample and discards fractional won exactly", () => {
  assert.equal(refundApplicationAmount({ paymentAmount: "3,290,000", refundRate: "50" }), 1645000);
  assert.equal(refundApplicationAmount({ paymentAmount: "10000", refundRate: "33.33" }), 3333);
  assert.equal(refundApplicationAmount({ paymentAmount: "1", refundRate: "99.99" }), 0);
  assert.equal(refundApplicationAmount({ paymentAmount: "1250000", refundRate: "0" }), 0);
  assert.equal(refundApplicationAmount({ paymentAmount: "9999999999999", refundRate: "100" }), 9999999999999);
  assert.equal(refundApplicationAmount({ paymentAmount: "9999999999999", refundRate: "99.99" }), 9998999999999);
});

async function assets() {
  const [font, template] = await Promise.all([readFile("public/fonts/NanumMyeongjo-Regular.ttf"), readFile("public/templates/refund-application-v1.pdf")]);
  return { font, template };
}

test("PDF preserves the original Letter form and embeds Korean text", async () => {
  const pdf = await createRefundApplicationPdf(input, await assets());
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  const result = Buffer.from(await pdf.save({ useObjectStreams: false }));
  assert.ok(result.subarray(0, 5).toString().startsWith("%PDF-"));
  assert.ok(result.includes(Buffer.from("/FontFile2")), "embedded TrueType font");
  assert.ok(result.includes(Buffer.from("/ToUnicode")), "Unicode text mapping");
});

test("PDF wraps long course titles but rejects values that would overflow the original cells", async () => {
  const resources = await assets();
  const pdf = await createRefundApplicationPdf({ ...input, courseName: "초코라떼의 연금같은 수익나는 수동구매대행 실전 심화 과정" }, resources);
  assert.equal(pdf.getPageCount(), 1);
  await assert.rejects(createRefundApplicationPdf({ ...input, courseName: "강".repeat(200) }, resources), /강의명.*칸보다 깁니다/u);
  await assert.rejects(createRefundApplicationPdf({ ...input, name: "홍".repeat(120) }, resources), /이름.*칸보다 깁니다/u);
});
