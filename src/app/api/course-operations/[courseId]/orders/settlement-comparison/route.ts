import { authorizeCourseOrders, loadCourseOrders, courseOrderErrorResponse, CourseOrderError } from "@/lib/course-orders/server";
import { loadComparisonMonths } from "@/lib/course-settlements/comparison-source";
import { normalizeName } from "@/lib/course-settlements/engine";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    const project = await admin.from("course_settlement_projects").select("id").eq("course_id", courseId).maybeSingle();
    if (project.error) throw new CourseOrderError("정산 정보를 조회하지 못했습니다.", 500);
    if (!project.data) throw new CourseOrderError("정산 자료가 없습니다.", 404);
    const course = await admin.from("courses").select("instructor_name").eq("id", courseId).single();
    if (course.error) throw new CourseOrderError("강사 정보를 조회하지 못했습니다.", 500);
    const orders = await loadCourseOrders(admin, courseId);
    const months = await loadComparisonMonths(admin, project.data.id);
    return Response.json({ orders: orders.orders, months, instructor: normalizeName(course.data.instructor_name) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
