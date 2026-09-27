import {
  loadCourseWbsBootstrap,
  requireWbsContext,
  wbsApiError,
} from "@/lib/course-wbs/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { workspaceId } = await requireWbsContext();
    return Response.json(await loadCourseWbsBootstrap(workspaceId));
  } catch (error) {
    return wbsApiError(error);
  }
}
