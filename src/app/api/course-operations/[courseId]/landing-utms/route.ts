import { authorizeCourseOrders, courseOrderErrorResponse, CourseOrderError } from "@/lib/course-orders/server";
import { deleteLandingUtm, deleteLandingUtms, importLandingUtms, loadLandingPageLink, loadLandingUtms, readUtmUpload } from "@/lib/course-landing-utms/server";
import { fetchTrackingUtms } from "@/lib/course-landing-utms/tracking";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 180;
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
    const { rows, fileName } = await readUtmUpload(await request.formData());
    const result = await importLandingUtms(admin, courseId, user.id, rows, fileName);
    return Response.json(result, { headers });
  } catch (error) { return courseOrderErrorResponse(error); }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new CourseOrderError("허용되지 않은 요청입니다.", 403);
    const { courseId } = await params;
    const { admin, user } = await authorizeCourseOrders(courseId);
    const link = await loadLandingPageLink(admin, courseId);
    if (!link) throw new CourseOrderError("강의 상세에서 무료 랜딩페이지 링크를 먼저 저장해 주세요.");
    const rows = await fetchTrackingUtms(link);
    if (await loadLandingPageLink(admin, courseId) !== link) throw new CourseOrderError("무료 랜딩페이지 링크가 변경되었습니다. 다시 업데이트해 주세요.", 409);
    const result = await importLandingUtms(admin, courseId, user.id, rows, "비즈업 어드민");
    return Response.json(result, { headers });
  } catch (error) { return courseOrderErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new CourseOrderError("허용되지 않은 요청입니다.", 403);
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    const input = z.union([
      z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(),
      z.object({ id: z.string().uuid() }).strict(),
    ]).safeParse(await request.json().catch(() => null));
    if (!input.success) throw new CourseOrderError("삭제할 UTM을 확인해 주세요.");
    if ("ids" in input.data) {
      const deletedIds = await deleteLandingUtms(admin, courseId, [...new Set(input.data.ids)]);
      return Response.json({ deletedIds }, { headers });
    }
    await deleteLandingUtm(admin, courseId, input.data.id);
    return Response.json({ deleted: true }, { headers });
  } catch (error) { return courseOrderErrorResponse(error); }
}
