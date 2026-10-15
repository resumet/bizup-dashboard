import "server-only";
import { readSheet } from "read-excel-file/node";
import { createAdminClient } from "@/lib/supabase/admin";
import { CourseOrderError } from "@/lib/course-orders/server";
import { parseLandingUtms, type LandingUtm, type UtmImportResult } from "./model";

export async function readUtmUpload(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/iu.test(file.name)) throw new CourseOrderError(".xlsx 엑셀 파일을 선택해 주세요.");
  if (!file.size || file.size > 4 * 1024 * 1024) throw new CourseOrderError("엑셀 파일은 비어 있지 않은 4 MB 이하 파일이어야 합니다.");
  let matrix: unknown[][];
  try { matrix = await readSheet(Buffer.from(await file.arrayBuffer()), 1) as unknown[][]; }
  catch { throw new CourseOrderError("엑셀 파일을 읽지 못했습니다. .xlsx 형식인지 확인해 주세요."); }
  return { rows: parseLandingUtms(matrix), fileName: file.name.slice(0, 255) };
}

export async function loadLandingUtms(admin: ReturnType<typeof createAdminClient>, courseId: string) {
  const items: LandingUtm[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from("course_landing_utms")
      .select("id,channel,referral_code,medium,url,short_url").eq("course_id", courseId)
      .order("channel").order("referral_code").order("medium").order("id").range(offset, offset + 499);
    if (error) throw new CourseOrderError("랜딩페이지 UTM을 불러오지 못했습니다. 다시 시도해 주세요.", 500);
    items.push(...(data ?? []));
    if (!data || data.length < 500) return items;
  }
}

export async function importLandingUtms(admin: ReturnType<typeof createAdminClient>, courseId: string, actorId: string, form: FormData) {
  const { rows, fileName } = await readUtmUpload(form);
  const { data, error } = await admin.rpc("import_course_landing_utms", { p_course_id: courseId, p_actor_id: actorId, p_rows: rows, p_file_name: fileName });
  if (error) throw new CourseOrderError("UTM을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.", 500);
  return data as UtmImportResult;
}

export async function deleteLandingUtm(admin: ReturnType<typeof createAdminClient>, courseId: string, id: string) {
  const { data, error } = await admin.from("course_landing_utms").delete()
    .eq("course_id", courseId).eq("id", id).select("id").maybeSingle();
  if (error) throw new CourseOrderError("UTM을 삭제하지 못했습니다. 다시 시도해 주세요.", 500);
  if (!data) throw new CourseOrderError("삭제할 UTM을 찾을 수 없습니다. 목록을 새로고침해 주세요.", 404);
}
