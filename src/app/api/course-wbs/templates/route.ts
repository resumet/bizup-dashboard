import {
  createWbsTemplate,
  requireWbsContext,
  wbsApiError,
} from "@/lib/course-wbs/server";
import { parseWbsTemplateBody } from "@/lib/course-wbs/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { workspaceId, actorId } = await requireWbsContext();
    const input = parseWbsTemplateBody(await request.json());
    const template = await createWbsTemplate(workspaceId, actorId, input);
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    return wbsApiError(error);
  }
}
