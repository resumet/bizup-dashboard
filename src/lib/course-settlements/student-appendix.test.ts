import assert from "node:assert/strict";
import test from "node:test";
import type { RosterRow } from "@/lib/jobs/types";
import { studentAppendixHtml, toStatementStudent } from "./student-appendix";

test("수강생의 클래스와 결제금액을 매핑하고 미등록 금액을 0과 구분한다", () => {
  const row = { normalizedPhone: "01012345678", values: { customerName: "동명이인", courseName: "강의", optionName: "심화반", email: "a@example.com", paymentAmount: "1,990,000원" } } as RosterRow;
  assert.deepEqual(toStatementStudent(row, "기본"), { name: "동명이인", phone: "01012345678", email: "a@example.com", className: "강의 / 심화반", paymentAmount: 1990000 });
  assert.equal(toStatementStudent({ ...row, values: { ...row.values, paymentAmount: "" } }, "기본").paymentAmount, null);
  assert.equal(toStatementStudent({ ...row, values: { ...row.values, paymentAmount: "0" } }, "기본").paymentAmount, 0);
});

test("인쇄 명단은 새 페이지에서 시작하며 동명이인과 HTML 문자를 보존한다", () => {
  const student = { name: "<동명이인>", phone: "010-1234-5678", email: "a@example.com", className: "강의 & 심화반", paymentAmount: 1000 };
  const html = studentAppendixHtml([student, { ...student, email: "b@example.com" }]);
  assert.match(html, /break-before:page/);
  assert.match(html, /table-header-group/);
  assert.equal(html.match(/&lt;동명이인&gt;/gu)?.length, 2);
  assert.match(html, /1,000원/);
  assert.match(html, /b@example.com/);
  assert.match(studentAppendixHtml([]), /등록된 유료수강생이 없습니다/);
});
