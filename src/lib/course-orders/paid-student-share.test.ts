import assert from "node:assert/strict";
import test from "node:test";
import type { RosterRow } from "@/lib/jobs/types";
import { paidRosterStudents } from "./paid-student-share";
import { createOrderStudentCsv, maskOrderStudentsForPublic, summarizeOrderStudents } from "./student-roster";

const row: RosterRow = {
  id: "enrollment-id", normalizedPhone: "01012345678", isManuallyAdded: true,
  sourceRowNumber: 2, isDuplicate: false, groupChatJoined: false, isExtraParticipant: false, memo: "private memo",
  values: { courseName: "강의", phone: "01012345678", referrer: "", source: "", adMedia: "", customerName: "김학생", email: "student@example.test", optionName: "기본반", paymentAmount: "3490000.00", paymentMethod: "카드", rs: "RS 파트너", paymentId: "secret-payment-id" },
};

test("공유는 저장된 명단의 수정·수동추가 정보를 사용하고 환불 수강생을 제외한다", () => {
  const students = paidRosterStudents([row, { ...row, id: "refunded", values: { ...row.values, ...{ refundedAt: "2026-09-16" } } }]);
  assert.equal(students.length, 1);
  assert.equal(students[0].name, "김학생");
  assert.equal(students[0].amount, 3490000);
  assert.equal(students[0].inflowType, "RS 파트너");
  assert.equal(students[0].paymentMethod, "카드");
  assert.equal(students[0].memo, "private memo");
  assert.equal(summarizeOrderStudents(students).amount, 3490000);
  assert.ok(!JSON.stringify(students).includes("secret-payment-id"));
  assert.ok(JSON.stringify(students).includes("private memo"));
});

test("별표 선택은 서버 전달값과 CSV에 일관되게 반영되며 해제해도 결제ID는 공개하지 않는다", () => {
  const students = paidRosterStudents([row]);
  const masked = maskOrderStudentsForPublic(students);
  const plain = maskOrderStudentsForPublic(students, false);
  assert.equal(masked[0].name, "김*생");
  assert.equal(masked[0].phone, "010-****-5678");
  assert.equal(masked[0].email, "*******@example.test");
  assert.equal(plain[0].name, "김학생");
  assert.equal(plain[0].phone, "010-1234-5678");
  assert.equal(plain[0].email, "student@example.test");
  const maskedCsv = createOrderStudentCsv(masked, false, "RS");
  const plainCsv = createOrderStudentCsv(plain, false, "RS");
  assert.ok(maskedCsv.includes("김*생") && !maskedCsv.includes("김학생"));
  assert.ok(plainCsv.includes("김학생") && plainCsv.includes("010-1234-5678"));
  assert.ok(plainCsv.includes("private memo"));
  assert.ok(plainCsv.includes('"RS"') && plainCsv.includes('"결제방법"'));
  assert.ok(!plainCsv.includes("secret-payment-id"));
  assert.ok(createOrderStudentCsv([{ ...plain[0], name: '=HYPERLINK("example")' }], false).includes('"\'=HYPERLINK'));
});

test("연결된 실제 수강생을 공개하고 결제자의 연락처나 이메일은 섞지 않는다", () => {
  const students = paidRosterStudents([{ ...row, values: { ...row.values, hasDifferentStudent: true, studentName: "실제학생", studentPhone: "01099998888" } }]);
  assert.equal(students[0].name, "실제학생");
  assert.equal(students[0].phone, "01099998888");
  assert.equal(students[0].email, "");
  assert.equal(students[0].originalPayerName, "김학생");
  assert.equal(students[0].originalPayerPhone, "01012345678");
  assert.equal(students[0].alternateStudentName, "실제학생");
  assert.equal(students[0].alternateStudentPhone, "01099998888");
  const masked = maskOrderStudentsForPublic(students);
  const plain = maskOrderStudentsForPublic(students, false);
  assert.equal(masked[0].memo, "private memo · 원결제자: 김*생 / 010-****-5678 · 대신 수강: 실**생 / 010-****-8888");
  assert.equal(plain[0].memo, "private memo · 원결제자: 김학생 / 010-1234-5678 · 대신 수강: 실제학생 / 010-9999-8888");
  const invalid = paidRosterStudents([{ ...row, values: { ...row.values, hasDifferentStudent: true } }]);
  assert.equal(invalid[0].phone, "");
});
