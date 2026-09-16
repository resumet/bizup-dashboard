import assert from "node:assert/strict";
import test from "node:test";
import { parseManualEnrollmentInput, parseManualEnrollmentName } from "./manual-enrollment";

test("수동 추가 결제정보를 보존하고 금액을 검증한다", () => {
  const input = {customerName:"학생",phone:"01012345678",rs:"파트너",paymentMethod:"카드",paymentId:"pay-1",paymentAmount:"120,000원"};
  const parsed = parseManualEnrollmentInput(input);
  assert.equal(parsed.rs,"파트너");
  assert.equal(parsed.paymentMethod,"카드");
  assert.equal(parsed.paymentId,"pay-1");
  assert.equal(parsed.paymentAmount,"120000");
  assert.throws(() => parseManualEnrollmentInput({...input,paymentAmount:"-100"}),/결제금액/);
});

test("수동 추가 수강생의 입력값과 전화번호를 정규화한다", () => {
  const parsed = parseManualEnrollmentInput({
    customerName: " 홍길동 ",
    phone: "010-1234-5678",
    email: " hong@example.com ",
    optionName: " A반 ",
    referrer: " 추천인 ",
    source: " 검색 ",
    adMedia: " 네이버 ",
  });

  assert.deepEqual(parsed, {
    customerName: "홍길동",
    normalizedPhone: "01012345678",
    email: "hong@example.com",
    optionName: "A반",
    referrer: "추천인",
    source: "검색",
    adMedia: "네이버",
  });
});

test("수동 추가 수강생 이름을 정리하고 빈 값과 최대 길이를 거부한다", () => {
  assert.equal(parseManualEnrollmentName("  새 이름  "), "새 이름");
  assert.throws(() => parseManualEnrollmentName("   "), /이름/);
  assert.throws(() => parseManualEnrollmentName("가".repeat(121)), /120자/);
});

test("수동 추가 시 이름, 숫자 연락처, 이메일 형식을 검증한다", () => {
  assert.throws(
    () => parseManualEnrollmentInput({ customerName: "", phone: "01012345678" }),
    /이름/,
  );
  assert.equal(
    parseManualEnrollmentInput({ customerName: "홍길동", phone: "84563448684" })
      .normalizedPhone,
    "84563448684",
  );
  assert.throws(
    () =>
      parseManualEnrollmentInput({
        customerName: "홍길동",
        phone: "01012345678",
        email: "invalid",
      }),
    /이메일/,
  );
});
