import { parseEditableWebinarMetrics } from "@/lib/course-webinars/metrics";
import { authorizedWebinarCourse, checkWebinarError, loadWebinarRecord, WebinarError, webinarErrorResponse } from "@/lib/course-webinars/server";
import { loadWebinarPayments } from "@/lib/course-webinars/paid-roster";
type Context = { params: Promise<{ courseId: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const client = await authorizedWebinarCourse(courseId);
    return Response.json({ metrics: await loadWebinarRecord(client, courseId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return webinarErrorResponse(error); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const client = await authorizedWebinarCourse(courseId);
    let body;
    try { body = await request.json(); } catch { throw new WebinarError("입력 형식이 올바르지 않습니다."); }
    if (!body || !Number.isInteger(body.version) || body.version < 0 || body.version > 2147483646) throw new WebinarError("저장 버전이 올바르지 않습니다.");
    let metrics;
    try { metrics = parseEditableWebinarMetrics(body.metrics); } catch (error) { throw new WebinarError((error as Error).message); }
    const payments = await loadWebinarPayments(client, [courseId]);
    const { data, error } = await client.rpc("save_course_webinar_metrics", { p_course_id: courseId, p_metrics: metrics, p_expected_version: body.version });
    checkWebinarError(error);
    return Response.json({ metrics: { ...data, ...payments.get(courseId) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return webinarErrorResponse(error); }
}
