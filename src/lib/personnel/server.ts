import "server-only";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";
import { loadLeaveBalance } from "@/lib/hr-leave/server";
import type { PersonnelDetail } from "./model";

export class PersonnelError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function personnelDatabaseError(error: { code?: string; message: string }) {
  if (/^PT(400|403|404|409)$/.test(error.code ?? "")) return new PersonnelError(error.message, Number(error.code!.slice(2)));
  if (error.code === "23505") return new PersonnelError("이미 등록된 계정 또는 이메일입니다. 기존 임직원 정보를 선택해 주세요.", 409);
  if (["23514", "23502", "22007", "22008", "22P02"].includes(error.code ?? "")) return new PersonnelError("입력 항목과 날짜를 확인해 주세요.");
  if (["PGRST202", "42P01"].includes(error.code ?? "")) return new PersonnelError("임직원 관리 DB 설정을 확인해 주세요.", 503);
  return new PersonnelError("임직원 정보를 처리하지 못했습니다.", 500);
}
export async function requirePersonnelContext() {
  const context = await requireWorkTaskContext();
  if (!context.isSuperAdmin) throw new PersonnelError("최고관리자만 이용할 수 있습니다.", 403);
  return context;
}
export async function loadPersonnelDetail(context: Awaited<ReturnType<typeof requirePersonnelContext>>, id: string, year: number): Promise<PersonnelDetail> {
  const { data, error } = await context.admin.rpc("personnel_query", { p_workspace_id: context.workspaceId, p_actor_id: context.user.id, p_id: id });
  if (error) throw personnelDatabaseError(error);
  const detail = data as PersonnelDetail;
  let balance = { baseGranted: 0, extraGranted: 0, used: 0, pending: 0, remaining: 0, availableToRequest: 0 };
  let upcoming = 0;
  if (detail.employee.user_id) {
    balance = await loadLeaveBalance(context, detail.employee.user_id, year);
    const planned = await context.admin.from("hr_leave_requests").select("days")
      .eq("workspace_id", context.workspaceId).eq("user_id", detail.employee.user_id).eq("status", "approved")
      .gte("leave_date", `${year}-01-01`).lte("leave_date", `${year}-12-31`).gt("leave_date", context.today);
    if (planned.error) throw personnelDatabaseError(planned.error);
    upcoming = (planned.data ?? []).reduce((sum, row) => sum + Number(row.days), 0);
  }
  detail.leave = { ...balance, year, upcoming };
  return detail;
}
