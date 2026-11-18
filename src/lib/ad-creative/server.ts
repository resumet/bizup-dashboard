import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CreativeData, CreativeRow } from "./model";

export type CreativeSourceSettings = Pick<CreativeData, "url" | "updatedAt" | "webinarName">;

export async function loadCreativeSourceSettings(workspaceId: string): Promise<CreativeSourceSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ad_creative_sources").select("spreadsheet_url,webinar_name,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error("Unable to load creative source settings.");
  if (!data) return { url: "", updatedAt: "", webinarName: "" };
  return { url: data.spreadsheet_url, updatedAt: data.updated_at, webinarName: data.webinar_name ?? "" };
}

export async function loadCreativeData(workspaceId: string): Promise<CreativeData> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ad_creative_sources").select("spreadsheet_url,rows,webinar_name,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error("소재성과 설정을 불러오지 못했습니다.");
  if (!data) return { url: "", updatedAt: "", rows: [], webinarName: "" };
  return { url: data.spreadsheet_url, updatedAt: data.updated_at, rows: data.rows as CreativeRow[], webinarName: data.webinar_name ?? "" };
}
