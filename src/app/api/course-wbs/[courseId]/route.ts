import {
  deleteCourseWbs,
  loadCourseWbs,
  requireWbsContext,
  saveCourseWbs,
  wbsApiError,
} from "@/lib/course-wbs/server";
import {
  parseWbsExpectedUpdatedAt,
  parseWbsItemsBody,
} from "@/lib/course-wbs/validation";

export const runtime = "nodejs";

type CourseWbsRouteContext = { params: Promise<{ courseId: string }> };

export async function GET(
  _request: Request,
  context: CourseWbsRouteContext,
) {
  try {
    const { workspaceId } = await requireWbsContext();
    const { courseId } = await context.params;
    return Response.json(await loadCourseWbs(workspaceId, courseId));
  } catch (error) {
    return wbsApiError(error);
  }
}

export async function PUT(
  request: Request,
  context: CourseWbsRouteContext,
) {
  try {
    const { workspaceId, actorId } = await requireWbsContext();
    const { courseId } = await context.params;
    const body = await request.json();
    const items = parseWbsItemsBody(body);
    const expectedUpdatedAt = parseWbsExpectedUpdatedAt(body);
    return Response.json(await saveCourseWbs(workspaceId, actorId, courseId, items, expectedUpdatedAt));
  } catch (error) {
    return wbsApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: CourseWbsRouteContext,
) {
  try {
    const { workspaceId } = await requireWbsContext();
    const { courseId } = await context.params;
    await deleteCourseWbs(workspaceId, courseId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return wbsApiError(error);
  }
}
