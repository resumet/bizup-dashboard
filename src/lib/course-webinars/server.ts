import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import type { WebinarCourse, WebinarRecord } from "./metrics";

export class WebinarError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export async function webinarClient() {
  const client = await createClient();
  if (!await getAuthenticatedUser(client)) throw new WebinarError("로그인이 필요합니다.", 401);
  return client;
}
export function checkWebinarError(error: { code?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST200", "PGRST202", "PGRST205"].includes(error.code ?? "")) throw new WebinarError("라이브 웨비나 저장 기능을 준비 중입니다. 관리자에게 DB 업데이트를 요청해 주세요.", 503);
  if (error.code === "PT409") throw new WebinarError("다른 변경이 있습니다. 입력값을 확인하고 새로 불러온 뒤 다시 저장해 주세요.", 409);
  if (error.code === "PT404") throw new WebinarError("강의를 찾을 수 없거나 접근 권한이 없습니다.", 404);
  if (error.code === "PT400" || error.code === "23514") throw new WebinarError("최대 인원과 입력 값의 범위를 확인해 주세요.");
  throw new WebinarError("웨비나 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
}
export function webinarErrorResponse(error: unknown) {
  return Response.json({ error: error instanceof WebinarError ? error.message : "웨비나 정보를 처리하지 못했습니다." }, { status: error instanceof WebinarError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
export async function authorizedWebinarCourse(courseId: string) {
  const client = await webinarClient();
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(courseId)) throw new WebinarError("강의 ID가 올바르지 않습니다.");
  const { data, error } = await client.from("courses").select("id").eq("id", courseId).maybeSingle();
  checkWebinarError(error);
  if (!data) throw new WebinarError("강의를 찾을 수 없거나 접근 권한이 없습니다.", 404);
  return client;
}
export async function listWebinarCourses(client: Awaited<ReturnType<typeof webinarClient>>) {
  const items: WebinarCourse[] = [];
  // PostgREST caps each response; traverse every page so courses without metrics also remain visible.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("courses")
      .select("id,name,instructor_name,free_webinar_at,course_webinar_metrics(*)")
      .order("free_webinar_at", { ascending: false }).order("id")
      .range(offset, offset + 499);
    checkWebinarError(error);
    for (const row of data ?? []) {
      const metric = row.course_webinar_metrics as unknown as WebinarRecord | WebinarRecord[] | null;
      items.push({ id: row.id, name: row.name, instructor_name: row.instructor_name, free_webinar_at: row.free_webinar_at, metrics: Array.isArray(metric) ? metric[0] ?? null : metric });
    }
    if (!data || data.length < 500) return items;
  }
}
