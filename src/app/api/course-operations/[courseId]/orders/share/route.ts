import {
  authorizeCourseOrders,
  courseOrderErrorResponse,
} from "@/lib/course-orders/server";
import {
  courseRosterSharePath,
  createCourseRosterShareSignature,
} from "@/lib/course-orders/public-share";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    const { data, error } = await admin.from("courses")
      .select("order_roster_share_enabled")
      .eq("id", courseId)
      .single();
    if (error) throw new Error(`공유 상태 조회 실패: ${error.code}`);
    const secret = process.env.COURSE_INTAKE_SESSION_SECRET?.trim() ?? "";
    const signature = createCourseRosterShareSignature(courseId, secret);
    return Response.json(
      { path: courseRosterSharePath(courseId, signature), enabled: data.order_roster_share_enabled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return courseOrderErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.enabled !== "boolean") throw new Error("공유 설정이 올바르지 않습니다.");
    const { data, error } = await admin.from("courses")
      .update({ order_roster_share_enabled: body.enabled })
      .eq("id", courseId)
      .select("order_roster_share_enabled")
      .single();
    if (error) throw new Error(`공유 상태 변경 실패: ${error.code}`);
    const secret = process.env.COURSE_INTAKE_SESSION_SECRET?.trim() ?? "";
    const signature = createCourseRosterShareSignature(courseId, secret);
    return Response.json(
      { path: courseRosterSharePath(courseId, signature), enabled: data.order_roster_share_enabled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return courseOrderErrorResponse(error);
  }
}
