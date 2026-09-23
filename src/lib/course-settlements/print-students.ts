import { printHtmlDocument } from "./print";
import { studentAppendixHtml, type StatementStudent } from "./student-appendix";

export async function printStatementWithStudents(title: string, body: string, courseId: string) {
  const popup = printHtmlDocument(title, "<p>수강생 목록을 준비하고 있습니다...</p>", undefined, false);
  try {
    const response = await fetch(`/api/course-operations/${encodeURIComponent(courseId)}/settlement-students`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    const result = await response.json() as { students?: StatementStudent[]; message?: string };
    if (!response.ok || !Array.isArray(result.students)) throw new Error(result.message || "수강생 목록을 불러오지 못했습니다.");
    if (popup.closed) throw new Error("인쇄 창이 닫혔습니다. 다시 시도해 주세요.");
    printHtmlDocument(title, body + studentAppendixHtml(result.students), popup, false);
    await popup.document.fonts.ready;
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error;
  }
}
