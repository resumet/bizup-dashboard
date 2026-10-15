import { authorizeCourseOrders, courseOrderErrorResponse, CourseOrderError } from "@/lib/course-orders/server";
import { importLandingUtms, loadLandingUtms } from "@/lib/course-landing-utms/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    return Response.json({ items: await loadLandingUtms(admin, courseId) }, { headers });
  } catch (error) { return courseOrderErrorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new CourseOrderError("허용되지 않은 요청입니다.", 403);
    const { courseId } = await params;
    const { admin, user } = await authorizeCourseOrders(courseId);
    if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024 + 65536) throw new CourseOrderError("엑셀 파일은 4 MB 이하여야 합니다.", 413);
    const result = await importLandingUtms(admin, courseId, user.id, await request.formData());
    return Response.json(result, { headers });
  } catch (error) { return courseOrderErrorResponse(error); }
}
