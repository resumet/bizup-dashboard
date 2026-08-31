import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ templateId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const { templateId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: membership }, { data: template }] = await Promise.all([
    admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    admin
      .from("message_templates")
      .select("id,name,workspace_id,is_system")
      .eq("id", templateId)
      .maybeSingle(),
  ]);

  if (!membership) {
    return Response.json(
      { message: "워크스페이스 권한이 없습니다." },
      { status: 403 },
    );
  }
  if (!template) {
    return Response.json(
      { message: "템플릿을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (template.is_system || !template.workspace_id) {
    return Response.json(
      { message: "기본 템플릿은 삭제할 수 없습니다." },
      { status: 400 },
    );
  }
  if (template.workspace_id !== membership.workspace_id) {
    return Response.json(
      { message: "이 템플릿을 삭제할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const { count, error: countError } = await admin
    .from("address_book_message_jobs")
    .select("id", { count: "exact", head: true })
    .eq("template_id", template.id);
  if (countError) {
    return Response.json(
      { message: `템플릿 사용 이력 확인 실패: ${countError.code}` },
      { status: 500 },
    );
  }
  if ((count ?? 0) > 0) {
    return Response.json(
      {
        message:
          "발송 이력에서 사용 중인 템플릿은 삭제할 수 없습니다. 발송 이력을 보존해야 합니다.",
      },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("message_templates")
    .delete()
    .eq("id", template.id)
    .eq("workspace_id", membership.workspace_id);
  if (error) {
    return Response.json(
      { message: `템플릿 삭제 실패: ${error.code}` },
      { status: 400 },
    );
  }

  await admin.from("audit_logs").insert({
    workspace_id: membership.workspace_id,
    actor_id: user.id,
    event_type: "message_template.deleted",
    entity_type: "message_template",
    entity_id: template.id,
    metadata: { template_name: template.name },
  });

  return Response.json({ message: "템플릿을 삭제했습니다." });
}
