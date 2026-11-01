import "server-only";

import {
  defaultInstagramChecklistTemplateItems,
  instagramChecklistCompletedItemIdsSchema,
  instagramChecklistTemplateItemsSchema,
} from "@/lib/course-documents/instagram-checklist";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InstagramPreparationInput, InstagramPreparationMaterial } from "./instagram-preparation";

type InstagramSettingRow = {
  course_id: string;
  instagram_account_url: string | null;
  instagram_total_count: number;
};

export async function loadDashboardInstagramPreparation(workspaceId: string) {
  const admin = createAdminClient();
  const [settingsResult, templateResult] = await Promise.all([
    admin
      .from("course_document_settings")
      .select("course_id,instagram_account_url,instagram_total_count")
      .eq("workspace_id", workspaceId),
    admin
      .from("instagram_management_checklists")
      .select("items")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (settingsResult.error) throw new Error(`인스타그램 설정 조회 실패: ${settingsResult.error.code}`);
  if (templateResult.error) throw new Error(`인스타그램 체크리스트 조회 실패: ${templateResult.error.code}`);

  const settings = (settingsResult.data ?? []) as InstagramSettingRow[];
  const courseIds = settings.map((setting) => setting.course_id);
  const templateItems = templateResult.data
    ? instagramChecklistTemplateItemsSchema.parse(templateResult.data.items)
    : defaultInstagramChecklistTemplateItems();
  if (!courseIds.length) return new Map<string, InstagramPreparationInput>();

  const [materialsResult, checklistStatesResult] = await Promise.all([
    admin
      .from("course_instagram_materials")
      .select("course_id,position,planning_completed,filming_completed,editing_completed,upload_completed")
      .in("course_id", courseIds)
      .order("position"),
    admin
      .from("course_instagram_checklist_states")
      .select("course_id,completed_item_ids")
      .in("course_id", courseIds),
  ]);
  if (materialsResult.error) throw new Error(`인스타그램 진행 현황 조회 실패: ${materialsResult.error.code}`);
  if (checklistStatesResult.error) throw new Error(`인스타그램 체크리스트 상태 조회 실패: ${checklistStatesResult.error.code}`);

  const materialsByCourse = new Map<string, InstagramPreparationMaterial[]>();
  for (const row of materialsResult.data ?? []) {
    const materials = materialsByCourse.get(row.course_id) ?? [];
    materials.push({
      position: row.position,
      planningCompleted: row.planning_completed,
      filmingCompleted: row.filming_completed,
      editingCompleted: row.editing_completed,
      uploadCompleted: row.upload_completed,
    });
    materialsByCourse.set(row.course_id, materials);
  }

  const templateIds = new Set(templateItems.map((item) => item.id));
  const completedChecklistByCourse = new Map<string, number>();
  for (const row of checklistStatesResult.data ?? []) {
    const completedIds = instagramChecklistCompletedItemIdsSchema.parse(row.completed_item_ids);
    completedChecklistByCourse.set(
      row.course_id,
      completedIds.filter((id) => templateIds.has(id)).length,
    );
  }

  return new Map(settings.map((setting) => {
    const checklistCompletedCount = completedChecklistByCourse.get(setting.course_id) ?? 0;
    return [setting.course_id, {
      configured: Boolean(setting.instagram_account_url?.trim())
        || setting.instagram_total_count > 0
        || checklistCompletedCount > 0,
      totalContentCount: setting.instagram_total_count,
      materials: materialsByCourse.get(setting.course_id) ?? [],
      checklistTotalCount: templateItems.length,
      checklistCompletedCount,
    }] as const;
  }));
}
