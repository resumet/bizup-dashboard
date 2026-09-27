import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
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
    const user = await getAuthenticatedUser(await createClient());
    if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
    if (!isSuperAdminEmail(user.email)) {
      return Response.json({ message: "최고관리자만 WBS 템플릿을 저장할 수 있습니다." }, { status: 403 });
    }
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
