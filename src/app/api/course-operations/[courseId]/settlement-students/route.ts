import { authorizeCourseOrders, courseOrderErrorResponse } from "@/lib/course-orders/server";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { toStatementStudent } from "@/lib/course-settlements/student-appendix";

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    const { data: job, error } = await admin.from("course_jobs")
      .select("id,latest_version,default_course_name")
      .eq("course_id", courseId).eq("is_order_roster", true).maybeSingle();
    if (error) throw new Error("유료수강생 명단을 조회하지 못했습니다.");
    const rows = job ? await loadJobEnrollmentRows(admin, job.id, job.latest_version) : [];
    return Response.json({ students: rows.map(row => toStatementStudent(row, job?.default_course_name ?? "")) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
