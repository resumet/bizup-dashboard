import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  dashboardMenuSearchKeywordSettingsSchema,
  normalizeDashboardMenuSearchKeywordSettings,
  type DashboardMenuSearchKeywordSettings,
} from "@/lib/dashboard/menu-search-keywords";

const TABLE = "dashboard_menu_search_settings";

export async function loadDashboardMenuSearchKeywordSettings(
  workspaceId: string,
  admin = createAdminClient(),
): Promise<DashboardMenuSearchKeywordSettings> {
  const { data, error } = await admin
    .from(TABLE)
    .select("keywords")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(`메뉴 검색어 설정 조회 실패: ${error.code ?? "UNKNOWN"}`);
  const parsed = dashboardMenuSearchKeywordSettingsSchema.safeParse({ keywords: data?.keywords ?? {} });
  if (!parsed.success) throw new Error("저장된 메뉴 검색어 설정이 올바르지 않습니다.");
  return normalizeDashboardMenuSearchKeywordSettings(parsed.data);
}

export async function saveDashboardMenuSearchKeywordSettings(
  workspaceId: string,
  updatedBy: string,
  settings: DashboardMenuSearchKeywordSettings,
  admin = createAdminClient(),
) {
  const validated = normalizeDashboardMenuSearchKeywordSettings(settings);
  const { data, error } = await admin
    .from(TABLE)
    .upsert({
      workspace_id: workspaceId,
      keywords: validated.keywords,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" })
    .select("keywords")
    .single();

  if (error) throw new Error(`메뉴 검색어 설정 저장 실패: ${error.code ?? "UNKNOWN"}`);
  return normalizeDashboardMenuSearchKeywordSettings({ keywords: data.keywords });
}
