import assert from "node:assert/strict";
import test from "node:test";

import { parseManualEnrollmentInput } from "./manual-enrollment";

test("수동 추가 수강생의 입력값과 전화번호를 정규화한다", () => {
  const parsed = parseManualEnrollmentInput({
    customerName: " 홍길동 ",
    phone: "010-1234-5678",
    email: " hong@example.com ",
    optionName: " A반 ",
  });

  assert.deepEqual(parsed, {
    customerName: "홍길동",
    normalizedPhone: "01012345678",
    email: "hong@example.com",
    optionName: "A반",
    referrer: "",
    source: "",
    adMedia: "",
  });
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
