import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterCreativeRowsByNickname, type CreativeCourse, type CreativeData, type CreativeRow } from "./model";

export async function loadCreativeCourse(workspaceId: string, courseId: string): Promise<CreativeCourse> {
  const { data, error } = await createAdminClient().from("courses").select("id,name,instructor_nickname")
    .eq("workspace_id", workspaceId).eq("id", courseId).maybeSingle();
  if (error || !data) throw new Error("선택한 강의 정보를 불러오지 못했습니다.");
  return data;
}

export async function loadCreativeData(workspaceId: string, course?: CreativeCourse): Promise<CreativeData> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ad_creative_sources").select("spreadsheet_url,rows,webinar_name,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error("소재성과 설정을 불러오지 못했습니다.");
  if (!data) return { url: "", updatedAt: "", rows: [], webinarName: "", course };
  const rows = data.rows as CreativeRow[];
  return { url: data.spreadsheet_url, updatedAt: data.updated_at, rows: course ? filterCreativeRowsByNickname(rows, course.instructor_nickname) : rows, webinarName: data.webinar_name ?? "", course };
}
