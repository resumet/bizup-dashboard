import writeXlsxFile, { type Row } from "write-excel-file/node";

import { courseDocumentErrorResponse, requireCourseDocumentAdmin } from "@/lib/course-documents/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { membership, admin } = await requireCourseDocumentAdmin();
    const params = new URL(request.url).searchParams;
    let query = admin.from("course_document_leads").select("instructor_name,name,phone,utm_source,utm_medium,utm_campaign,utm_content,referrer,created_at,course_id,document_id,course_documents!inner(title),courses!inner(name)").eq("workspace_id", membership.workspace_id).order("created_at", { ascending: false });
    const courseId = params.get("courseId");
    const documentId = params.get("documentId");
    const instructor = params.get("instructor");
    const from = params.get("from");
    const to = params.get("to");
    if (courseId) query = query.eq("course_id", courseId);
    if (documentId) query = query.eq("document_id", documentId);
    if (instructor) query = query.eq("instructor_name", instructor);
    if (from) query = query.gte("created_at", `${from}T00:00:00+09:00`);
    if (to) {
      const nextDay = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86_400_000);
      query = query.lt("created_at", nextDay.toISOString());
    }
    const { data, error } = await query;
    if (error) throw new Error(`리드 Excel 조회 실패: ${error.code}`);
    const header = ["강사명", "강의명", "문서명", "이름", "전화번호", "UTM Source", "UTM Medium", "UTM Campaign", "UTM Content", "Referrer", "등록일"];
    const rows: Row[] = [header.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#F4F4F5" }))];
    for (const lead of data ?? []) {
      const document = Array.isArray(lead.course_documents) ? lead.course_documents[0] : lead.course_documents;
      const course = Array.isArray(lead.courses) ? lead.courses[0] : lead.courses;
      rows.push([lead.instructor_name, course?.name ?? "", document?.title ?? "", lead.name, { value: lead.phone, type: String }, lead.utm_source ?? "", lead.utm_medium ?? "", lead.utm_campaign ?? "", lead.utm_content ?? "", lead.referrer ?? "", new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(lead.created_at))]);
    }
    const buffer = await writeXlsxFile(rows, { sheet: "리드", stickyRowsCount: 1, columns: [{ width: 18 }, { width: 30 }, { width: 34 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 22 }, { width: 36 }, { width: 22 }] }).toBuffer();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const filename = `인스타그램_리드_${today}.xlsx`;
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
