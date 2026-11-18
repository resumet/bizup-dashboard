import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignCreativeInstructors, type CreativeData, type CreativeRow, type CreativeCourse } from "./model";

export type CreativeSourceSettings = Pick<CreativeData, "url" | "updatedAt" | "matchingKeywords">;

export async function loadCreativeSourceSettings(workspaceId: string): Promise<CreativeSourceSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ad_creative_sources").select("spreadsheet_url,matching_keywords,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error("Unable to load creative source settings.");
  if (!data) return { url: "", updatedAt: "", matchingKeywords: "" };
  return { url: data.spreadsheet_url, updatedAt: data.updated_at, matchingKeywords: data.matching_keywords ?? "" };
}

export async function loadCreativeData(workspaceId: string): Promise<CreativeData> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ad_creative_sources").select("spreadsheet_url,rows,matching_keywords,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error("소재성과 설정을 불러오지 못했습니다.");
  if (!data) return { url: "", updatedAt: "", rows: [], matchingKeywords: "" };
  const courses: CreativeCourse[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await admin.from("courses").select("name,instructor_name").eq("workspace_id", workspaceId).order("id").range(offset, offset + 999);
    if (result.error) throw new Error("강사 정보를 불러오지 못했습니다.");
    courses.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return { url: data.spreadsheet_url, updatedAt: data.updated_at, rows: assignCreativeInstructors(data.rows as CreativeRow[], courses), matchingKeywords: data.matching_keywords ?? "" };
}
