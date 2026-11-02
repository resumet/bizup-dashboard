import { isSuperAdminEmail } from "@/lib/admin/access";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { youtubeFilmingAlertSettingsSchema } from "@/lib/youtube-management/settings";
import { saveYoutubeFilmingAlertSettings } from "@/lib/youtube-management/settings-server";

const headers = { "Cache-Control": "private, no-store" };

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  if (!isSuperAdminEmail(user.email)) {
    return Response.json({ message: "최고관리자만 알림 기준을 변경할 수 있습니다." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400, headers });
  }

  const parsed = youtubeFilmingAlertSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: parsed.error.issues[0]?.message ?? "알림 기준을 확인해 주세요." }, { status: 400, headers });
  }

  try {
    const membership = await requireCourseOperationsMembership(user.id);
    const settings = await saveYoutubeFilmingAlertSettings(membership.workspace_id, parsed.data);
    return Response.json(settings, { headers });
  } catch (error) {
    console.error("youtube_filming_alert_settings_save_failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ message: "알림 기준을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500, headers });
  }
}
