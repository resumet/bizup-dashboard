import { ensureDefaultMessageTemplates } from "@/lib/message-studio/default-template-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ position: string }> };

async function context(params: Context["params"]) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) throw new Error("UNAUTHORIZED");
  const position = Number((await params).position);
  if (!Number.isInteger(position) || position < 1 || position > 30)
    throw new Error("기본 템플릿 번호가 올바르지 않습니다.");
  const { workspaceId } = await ensureDefaultMessageTemplates(user.id);
  return { user, workspaceId, position };
}

function response(error: unknown) {
  const message =
    error instanceof Error ? error.message : "처리하지 못했습니다.";
  return Response.json(
    { message: message === "UNAUTHORIZED" ? "로그인이 필요합니다." : message },
    { status: message === "UNAUTHORIZED" ? 401 : 400 },
  );
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { workspaceId, position } = await context(params);
    const body = (await request.json()) as { content?: string };
    const content = String(body.content ?? "").trim();
    if (!content) throw new Error("기본 문자 내용을 입력해 주세요.");
    const { error } = await createAdminClient()
      .from("message_studio_default_templates")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("position", position);
    if (error) throw new Error(`기본 템플릿 수정 실패: ${error.code}`);
    return Response.json({ position, content });
  } catch (error) {
    return response(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { workspaceId, position } = await context(params);
    const { error } = await createAdminClient()
      .from("message_studio_default_templates")
      .update({ content: "", updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("position", position);
    if (error) throw new Error(`기본 템플릿 삭제 실패: ${error.code}`);
    return Response.json({ position });
  } catch (error) {
    return response(error);
  }
}
