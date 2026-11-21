import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCreativeSource } from "./source";

export async function refreshCreativeData(
  workspaceId: string,
  actorId: string,
  dependencies = { client: createAdminClient(), loadSource: loadCreativeSource },
) {
  const { client, loadSource } = dependencies;
  const { data: current, error } = await client.from("ad_creative_sources")
    .select("spreadsheet_url,webinar_name,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error("소재성과 설정을 불러오지 못했습니다.");
  if (!current?.spreadsheet_url) throw new Error("원본 데이터 설정에서 소재성과 Google 시트를 먼저 연결해 주세요.");

  // Refresh the shared source without restricting it to the current course.
  // Both the media summary and creative table read this same saved snapshot.
  const source = await loadSource(current.spreadsheet_url, current.webinar_name ?? "");
  const saved = await client.from("ad_creative_sources").update({
    rows: source.rows, updated_by: actorId, updated_at: new Date().toISOString(),
  }).eq("workspace_id", workspaceId).eq("updated_at", current.updated_at)
    .select("workspace_id").maybeSingle();
  if (saved.error) throw new Error("소재성과 데이터를 저장하지 못했습니다.");
  if (!saved.data) throw new Error("소재성과 설정이 변경되었습니다. 업데이트를 다시 눌러 주세요.");
  return { rowCount: source.rows.length };
}
