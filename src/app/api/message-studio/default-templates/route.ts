import { ensureDefaultMessageTemplates } from "@/lib/message-studio/default-template-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json()) as { content?: string };
    const content = String(body.content ?? "").trim();
    if (!content) throw new Error("추가할 기본 문자를 입력해 주세요.");
    const { workspaceId, templates } = await ensureDefaultMessageTemplates(
      user.id,
    );
    const empty = templates.find((template) => !template.content.trim());
    if (!empty)
      throw new Error("기본 템플릿은 최대 30개까지 관리할 수 있습니다.");
    const { error } = await createAdminClient()
      .from("message_studio_default_templates")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("position", empty.position);
    if (error) throw new Error(`기본 템플릿 추가 실패: ${error.code}`);
    return Response.json(
      { position: empty.position, content },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "추가하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
