import assert from "node:assert/strict";
import test from "node:test";

import { instructorContractInstructorSchema } from "./instructor-contract-validation";

test("강사 정보는 전화번호·주소·이메일을 정규화하고 형식을 검증한다", () => {
  const parsed = instructorContractInstructorSchema.parse({
    instructorName: " 강사 ",
    address: " 서울시 강남구 ",
    phone: "010 1234 5678",
    email: " TEST@EXAMPLE.COM ",
  });
  assert.deepEqual(parsed, {
    partyType: "instructor",
    instructorName: "강사",
    address: "서울시 강남구",
    phone: "010-1234-5678",
    email: "test@example.com",
    details: {},
  });
  assert.equal(instructorContractInstructorSchema.safeParse({ instructorName: "강사", address: "", phone: "010-123-4567", email: "" }).success, false);
  assert.equal(instructorContractInstructorSchema.safeParse({ instructorName: "강사", address: "", phone: "", email: "invalid-email" }).success, false);
});
