import type { RosterRow } from "@/lib/jobs/types";
import { escapePrintHtml } from "./print";

export type StatementStudent = {
  name: string;
  phone: string;
  email: string;
  className: string;
  paymentAmount: number | null;
};

export function toStatementStudent(row: RosterRow, courseName: string): StatementStudent {
  const raw = String(row.values.paymentAmount ?? "").replace(/[,\s₩원]/gu, "");
  const amount = raw && /^\d+(\.\d+)?$/u.test(raw) ? Number(raw) : null;
  return {
    name: row.values.customerName || "-",
    phone: row.values.phone || row.normalizedPhone || "-",
    email: row.values.email || "-",
    className: [row.values.courseName || courseName, row.values.optionName].filter(Boolean).join(" / "),
    paymentAmount: amount !== null && Number.isFinite(amount) ? amount : null,
  };
}

export function studentAppendixHtml(students: StatementStudent[]) {
  const rows = students.map(student => `<tr><td>${escapePrintHtml(student.name)}</td><td>${escapePrintHtml(student.phone)}</td><td>${escapePrintHtml(student.email)}</td><td>${escapePrintHtml(student.className)}</td><td class="student-amount">${student.paymentAmount === null ? "-" : `${Math.round(student.paymentAmount).toLocaleString("ko-KR")}원`}</td></tr>`).join("");
  return `<style>section.student-appendix{break-before:page;break-inside:auto}.student-appendix h2{margin-top:0}.student-table{table-layout:fixed;width:100%}.student-table thead{display:table-header-group}.student-table tr{break-inside:avoid}.student-table th,.student-table td{white-space:normal;overflow-wrap:anywhere}.student-table .student-amount{text-align:right}</style><section class="student-appendix"><h2>수강생 목록</h2><p>유료수강생 명단 기준 · 총 ${students.length.toLocaleString("ko-KR")}명</p><table class="student-table"><colgroup><col style="width:12%"><col style="width:19%"><col style="width:25%"><col style="width:28%"><col style="width:16%"></colgroup><thead><tr><th>이름</th><th>전화번호</th><th>이메일</th><th>신청한 클래스</th><th>결제금액</th></tr></thead><tbody>${rows || '<tr><td colspan="5">등록된 유료수강생이 없습니다.</td></tr>'}</tbody></table></section>`;
}
