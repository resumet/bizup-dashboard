import assert from "node:assert/strict";
import test from "node:test";
import type { RosterRow } from "@/lib/jobs/types";
import { rosterIncludesContact } from "./contact-courses";

function row(phone: string, extra: Partial<RosterRow["values"]> & { refundedAt?: string } = {}): RosterRow {
  return {
    id: phone, sourceRowNumber: 1, normalizedPhone: phone, isDuplicate: false,
    groupChatJoined: false, isExtraParticipant: false, isManuallyAdded: false, memo: "",
    values: { courseName: "강의", phone, customerName: "홍길동", email: "", optionName: "", referrer: "", source: "", adMedia: "", ...extra },
  };
}

test("이름이 같아도 번호가 다르면 제외하고 국가번호·하이픈 차이는 정리한다", () => {
  assert.equal(rosterIncludesContact([row("010-1234-5678")], "+82 10 1234 5678"), true);
  assert.equal(rosterIncludesContact([row("01099998888")], "01012345678"), false);
  assert.equal(rosterIncludesContact([row("")], ""), false);
  assert.equal(rosterIncludesContact([row("abc01012345678")], "01012345678"), false);
});

test("환불자는 제외하고 대신 수강자는 실제 수강생 전화번호로 연결한다", () => {
  assert.equal(rosterIncludesContact([row("01012345678", { refundedAt: "2026-10-01" })], "01012345678"), false);
  const rows = [row("01012345678", { hasDifferentStudent: true, studentName: "수강생", studentPhone: "01099998888" })];
  assert.equal(rosterIncludesContact(rows, "01099998888"), true);
  assert.equal(rosterIncludesContact(rows, "01012345678"), false);
  assert.equal(rosterIncludesContact([row("01012345678", { hasDifferentStudent: true })], "01012345678"), false);
});
