import assert from "node:assert/strict";
import test from "node:test";
import type { RosterRow } from "@/lib/jobs/types";
import { comparePaidStudents } from "./compare-paid-students";

function row(phone: string, name = "수강생", extra: Partial<RosterRow["values"]> & { refundedAt?: string } = {}): RosterRow {
  return {
    id: `${name}-${phone}`, sourceRowNumber: 1, normalizedPhone: phone, isDuplicate: false,
    groupChatJoined: false, isExtraParticipant: false, isManuallyAdded: false, memo: "비공개 메모",
    values: { courseName: "강의", phone, customerName: name, email: "", optionName: "", referrer: "", source: "", adMedia: "", ...extra },
  };
}

test("국가번호·하이픈 차이를 정리하고 중복 행은 한 명으로 집계하며 양쪽 정보를 보존한다", () => {
  const left = [row("010-1234-5678", "이름1", { email: "one@example.test" }), row("01012345678", "이름2"), row("01099998888", "한쪽만")];
  const right = [row("+82 10 1234 5678", "다른 이름", { email: "two@example.test" })];
  const before = structuredClone({ left, right });
  const result = comparePaidStudents(left, right);
  assert.deepEqual(result.matches, [{ phone: "01012345678", left: { names: ["이름1", "이름2"], emails: ["one@example.test"] }, right: { names: ["다른 이름"], emails: ["two@example.test"] } }]);
  assert.deepEqual(result.left, { rowCount: 3, uniqueCount: 2, invalidPhoneCount: 0 });
  assert.deepEqual({ left, right }, before);
  assert.ok(!JSON.stringify(result).includes("비공개 메모"));
});

test("환불자·잘못된 번호는 비교하지 않고 결제자 대신 실제 수강생을 비교한다", () => {
  const left = [row("01000000000", "결제자", { hasDifferentStudent: true, studentName: "실제 수강생", studentPhone: "01012345678", email: "payer@example.test" }), row("01099998888", "환불자", { refundedAt: "2026-10-01" }), row(""), row("abc01012345678")];
  const result = comparePaidStudents(left, [row("01012345678"), row("01099998888"), row(""), row("abc01012345678")]);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].left, { names: ["실제 수강생"], emails: [] });
  assert.deepEqual(result.left, { rowCount: 3, uniqueCount: 1, invalidPhoneCount: 2 });
});

test("이름만 같은 사람은 중복이 아니며 빈 명단도 처리한다", () => {
  assert.equal(comparePaidStudents([row("01011112222")], [row("01033334444")]).matches.length, 0);
  assert.deepEqual(comparePaidStudents([], []).matches, []);
});
