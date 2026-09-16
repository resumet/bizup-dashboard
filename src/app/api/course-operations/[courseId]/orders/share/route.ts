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
    await authorizeCourseOrders(courseId);
    const secret = process.env.COURSE_INTAKE_SESSION_SECRET?.trim() ?? "";
    const signature = createCourseRosterShareSignature(courseId, secret);
    return Response.json(
      { path: courseRosterSharePath(courseId, signature) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return courseOrderErrorResponse(error);
  }
}
