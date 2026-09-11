import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ templateId: string }> };

async function handle(request: Request, { params }: Context) {
  const { templateId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  const [membership, template] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id").eq("user_id", user.id).limit(1).maybeSingle(),
    supabase.from("message_templates").select("id,workspace_id").eq("id", templateId).maybeSingle(),
  ]);
  if (membership.error || template.error) return Response.json({ message: "권한을 확인하지 못했습니다." }, { status: 500 });
  if (!membership.data || !template.data || (template.data.workspace_id && template.data.workspace_id !== membership.data.workspace_id)) {
    return Response.json({ message: "템플릿을 찾을 수 없거나 권한이 없습니다." }, { status: 404 });
  }
  const workspaceId = membership.data.workspace_id;
  if (request.method === "GET") {
    const { data, error } = await supabase.from("message_template_previews").select("body").eq("workspace_id", workspaceId).eq("template_id", templateId).maybeSingle();
    return error ? Response.json({ message: "미리보기 본문을 불러오지 못했습니다." }, { status: 500 }) : Response.json({ body: data?.body ?? "" }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const { body } = await request.json();
    if (typeof body !== "string" || body.length > 10000) throw new Error("본문은 10,000자 이하로 입력해 주세요.");
    const { error } = await supabase.from("message_template_previews").upsert({ workspace_id: workspaceId, template_id: templateId, body });
    if (error) throw new Error("미리보기 본문을 저장하지 못했습니다.");
    return Response.json({ message: "미리보기 본문을 저장했습니다." });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "본문 저장 실패" }, { status: 400 });
  }
}

export const GET = handle;
export const PATCH = handle;
