import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export class HrError extends Error { constructor(message: string, public status = 400, public fields?: Record<string, string[]>) { super(message); } }
export function databaseError(error: { code?: string; message: string }): HrError {
  if (/^PT(400|401|403|404|409)$/.test(error.code ?? "")) return new HrError(error.message, Number(error.code!.slice(2)));
  if (error.code === "PGRST202" || error.code === "42P01") return new HrError("HR 데이터베이스 초기 설정이 필요합니다. 관리자에게 문의해 주세요.", 503);
  if (["22P02", "22008", "22007", "23502", "23514"].includes(error.code ?? "")) return new HrError("입력 형식과 필수 항목을 확인해 주세요.", 400);
  return new HrError("HR 데이터를 처리하지 못했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.", 500);
}
export async function hrClient() {
  const client = await createClient();
  if (!await getAuthenticatedUser(client)) throw new HrError("로그인이 필요합니다.", 401);
  return client;
}
export async function hrQuery<T>(resource: string, filter: Record<string, unknown> = {}): Promise<T> {
  const client = await hrClient();
  const { data, error } = await client.rpc("hr_query", { p_resource: resource, p_filter: filter });
  if (error) throw databaseError(error);
  return data as T;
}
export async function processHrNotifications() {
  const admin = createAdminClient();
  const reminders = await admin.rpc("hr_generate_reminders");
  const processed = await admin.rpc("hr_process_notifications", { p_limit: 500 });
  if (reminders.error || processed.error) throw new HrError("HR 알림 작업이 완료되지 않았습니다. 다음 실행에서 재시도합니다.", 503);
  return { reminders: reminders.data, ...processed.data };
}
