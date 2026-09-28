import { isSuperAdminEmail } from "@/lib/admin/access";
import { requireAccountStatusChange } from "@/lib/admin/account-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getAuthenticatedUser(await createClient());
  if (!actor) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isSuperAdminEmail(actor.email)) return Response.json({ message: "최고관리자만 계정 상태를 변경할 수 있습니다." }, { status: 403 });
  const { userId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return Response.json({ message: "잘못된 사용자 ID입니다." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return Response.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
  let active: boolean;
  try { active = requireAccountStatusChange(actor.id, data.user, (await request.json()).active); }
  catch (e) { return Response.json({ message: e instanceof Error ? e.message : "잘못된 요청입니다." }, { status: 400 }); }
  const updated = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
    app_metadata: { ...data.user.app_metadata, account_disabled: !active, account_status_changed_at: new Date().toISOString(), account_status_changed_by: actor.id },
  });
  if (updated.error) return Response.json({ message: "계정 상태를 저장하지 못했습니다." }, { status: 500 });
  return Response.json({ active });
}
