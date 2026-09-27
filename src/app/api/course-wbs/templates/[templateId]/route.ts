import {
  requireWbsContext,
  updateWbsTemplate,
  wbsApiError,
} from "@/lib/course-wbs/server";
import {
  parseWbsExpectedUpdatedAt,
  parseWbsTemplateBody,
} from "@/lib/course-wbs/validation";

export const runtime = "nodejs";

type TemplateRouteContext = { params: Promise<{ templateId: string }> };

export async function PUT(
  request: Request,
  context: TemplateRouteContext,
) {
  try {
    const { workspaceId, actorId } = await requireWbsContext();
    const { templateId } = await context.params;
    const body = await request.json();
    const input = parseWbsTemplateBody(body);
    const expectedUpdatedAt = parseWbsExpectedUpdatedAt(body);
    const template = await updateWbsTemplate(workspaceId, actorId, templateId, { ...input, expectedUpdatedAt });
    return Response.json({ template });
  } catch (error) {
    return wbsApiError(error);
  }
}
