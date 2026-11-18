import { isSuperAdminEmail } from "@/lib/admin/access";
import { DEFAULT_PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/supabase/password-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ userId: string }> };

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function PATCH(request: Request, { params }: Context) {
  const actor = await getAuthenticatedUser(await createClient());
  if (!actor) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isSuperAdminEmail(actor.email)) return Response.json({ message: "최고관리자만 사용자의 비밀번호를 변경할 수 있습니다." }, { status: 403 });

  const { userId } = await params;
  if (!USER_ID_PATTERN.test(userId)) return Response.json({ message: "사용자 ID가 올바르지 않습니다." }, { status: 400 });

  let password: string;
  let confirmation: string;
  try {
    const body = await request.json() as { password?: unknown; confirmation?: unknown };
    if (typeof body.password !== "string" || typeof body.confirmation !== "string") throw new Error("새 비밀번호와 확인 비밀번호를 입력해 주세요.");
    password = body.password;
    confirmation = body.confirmation;
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "비밀번호를 확인해 주세요." }, { status: 400 });
  }

  const validation = validateNewPassword(password, confirmation, DEFAULT_PASSWORD_MIN_LENGTH);
  if (validation) return Response.json({ message: validation }, { status: 400 });
  if (password.length > 128) return Response.json({ message: "비밀번호는 128자 이하로 입력해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !targetResult.user) return Response.json({ message: "변경할 사용자를 찾을 수 없습니다." }, { status: 404 });

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateError) return Response.json({ message: "비밀번호를 변경하지 못했습니다. 보안 정책을 확인해 주세요." }, { status: 400 });

  const memberships = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId).limit(1);
  const workspaceId = memberships.data?.[0]?.workspace_id;
  if (workspaceId) {
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: actor.id,
      event_type: "admin.user_password_updated",
      entity_type: "user",
      entity_id: userId,
      metadata: { target_email: targetResult.user.email ?? null },
    });
  }

  return Response.json({ message: "비밀번호를 변경했습니다." });
}
