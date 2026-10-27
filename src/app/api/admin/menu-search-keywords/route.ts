import { isSuperAdminEmail } from "@/lib/admin/access";
import { saveDashboardMenuSearchKeywordSettings } from "@/lib/admin/menu-search-keywords-storage";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { dashboardMenuSearchKeywordSettingsSchema } from "@/lib/dashboard/menu-search-keywords";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  if (!isSuperAdminEmail(user.email)) {
    return Response.json({ message: "최고관리자만 메뉴 검색어를 변경할 수 있습니다." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400, headers });
  }

  const parsed = dashboardMenuSearchKeywordSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: parsed.error.issues[0]?.message ?? "메뉴 검색어를 확인해 주세요." }, { status: 400, headers });
  }

  try {
    const membership = await requireCourseOperationsMembership(user.id);
    const settings = await saveDashboardMenuSearchKeywordSettings(
      membership.workspace_id,
      user.id,
      parsed.data,
    );
    return Response.json(settings, { headers });
  } catch (error) {
    console.error("dashboard_menu_search_keywords_save_failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ message: "메뉴 검색어를 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500, headers });
  }
}
