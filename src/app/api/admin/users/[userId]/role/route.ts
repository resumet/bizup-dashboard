import {
  isSuperAdminEmail,
  toWorkspaceRole,
  type EditableAccountRole,
} from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ userId: string }> };

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function PATCH(request: Request, { params }: Context) {
  const supabase = await createClient();
  const currentUser = await getAuthenticatedUser(supabase);
  if (!currentUser) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isSuperAdminEmail(currentUser.email)) {
    return Response.json(
      { message: "최고관리자만 사용자 권한을 변경할 수 있습니다." },
      { status: 403 },
    );
  }

  const { userId } = await params;
  if (!USER_ID_PATTERN.test(userId)) {
    return Response.json(
      { message: "사용자 ID가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  let role: EditableAccountRole;
  try {
    const body = (await request.json()) as { role?: unknown };
    if (body.role !== "admin" && body.role !== "user") {
      return Response.json(
        { message: "권한은 관리자 또는 사용자만 선택할 수 있습니다." },
        { status: 400 },
      );
    }
    role = body.role;
  } catch {
    return Response.json(
      { message: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: targetResult, error: targetError } =
    await admin.auth.admin.getUserById(userId);
  const targetUser = targetResult.user;
  if (targetError || !targetUser) {
    return Response.json(
      { message: "변경할 사용자를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (isSuperAdminEmail(targetUser.email)) {
    return Response.json(
      { message: "최고관리자 권한은 변경할 수 없습니다." },
      { status: 400 },
    );
  }

  const workspaceRole = toWorkspaceRole(role);
  const { data: workspaceId, error: roleError } = await admin.rpc(
    "set_user_account_role",
    {
      target_user_id: userId,
      target_role: workspaceRole,
    },
  );
  if (roleError || typeof workspaceId !== "string") {
    return Response.json(
      {
        message: roleError
          ? `권한 변경 실패: ${roleError.message}`
          : "권한 변경 결과를 확인하지 못했습니다.",
      },
      { status: 400 },
    );
  }

  await admin.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_id: currentUser.id,
    event_type: "admin.user_role_updated",
    entity_type: "user",
    entity_id: userId,
    metadata: {
      email: targetUser.email ?? null,
      role,
      workspace_role: workspaceRole,
    },
  });

  return Response.json({
    message: `${targetUser.email ?? "사용자"} 권한을 ${role === "admin" ? "관리자" : "사용자"}로 변경했습니다.`,
    role,
  });
}
