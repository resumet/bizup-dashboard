import { isSuperAdminEmail } from "@/lib/admin/access";
import { requireUserDisplayName } from "@/lib/admin/user-names";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ userId: string }> };

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function PATCH(request: Request, { params }: Context) {
  const currentUser = await getAuthenticatedUser(await createClient());
  if (!currentUser) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isSuperAdminEmail(currentUser.email)) {
    return Response.json({ message: "최고관리자만 사용자 이름을 변경할 수 있습니다." }, { status: 403 });
  }

  const { userId } = await params;
  if (!USER_ID_PATTERN.test(userId)) {
    return Response.json({ message: "사용자 ID가 올바르지 않습니다." }, { status: 400 });
  }

  let name: string;
  try {
    const body = await request.json() as { name?: unknown };
    name = requireUserDisplayName(body.name);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "사용자 이름을 확인해 주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
  const target = targetResult.user;
  if (targetError || !target) {
    return Response.json({ message: "변경할 사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const previousName = typeof target.user_metadata.display_name === "string"
    ? target.user_metadata.display_name
    : null;
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...target.user_metadata, display_name: name },
  });
  if (updateError) {
    return Response.json({ message: `사용자 이름 저장 실패: ${updateError.message}` }, { status: 400 });
  }

  const memberships = await admin.from("workspace_members").select("workspace_id")
    .eq("user_id", userId).limit(1);
  const workspaceId = memberships.data?.[0]?.workspace_id;
  if (workspaceId) {
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: currentUser.id,
      event_type: "admin.user_name_updated",
      entity_type: "user",
      entity_id: userId,
      metadata: { previous_name: previousName, name },
    });
  }

  return Response.json({ message: "사용자 이름을 저장했습니다.", name });
}
