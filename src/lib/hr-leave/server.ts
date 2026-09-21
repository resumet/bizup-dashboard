import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { leaveBalance } from "./policy";
import type {
  HrLeaveDashboardData,
  HrLeaveRequest,
  HrSupportRecord,
} from "./types";
import { loadWorkspacePeople, requireWorkTaskContext } from "@/lib/work-tasks/server";

type LeaveContext = Awaited<ReturnType<typeof requireWorkTaskContext>>;

function migrationError(message: string) {
  if (/hr_leave_|PGRST20[04]|42P01/i.test(message)) {
    return new Error("휴가 관리 DB 마이그레이션을 먼저 적용해 주세요.");
  }
  return new Error(message);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function requireHrLeaveContext() {
  return requireWorkTaskContext();
}

export async function assertWorkspaceMember(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("해당 직원을 찾을 수 없습니다.");
}

export async function loadLeaveBalance(
  context: Pick<LeaveContext, "admin" | "workspaceId">,
  userId: string,
  year: number,
) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [grantResult, requestResult, supportResult] = await Promise.all([
    context.admin.from("hr_annual_leave_grants").select("granted_days")
      .eq("workspace_id", context.workspaceId).eq("user_id", userId).eq("grant_year", year).maybeSingle(),
    context.admin.from("hr_leave_requests").select("days,status")
      .eq("workspace_id", context.workspaceId).eq("user_id", userId)
      .gte("leave_date", start).lte("leave_date", end),
    context.admin.from("hr_leave_support_records").select("earned_days,status")
      .eq("workspace_id", context.workspaceId).eq("user_id", userId)
      .gte("support_date", start).lte("support_date", end),
  ]);
  const error = grantResult.error ?? requestResult.error ?? supportResult.error;
  if (error) throw migrationError(error.message);
  return leaveBalance(
    numberValue(grantResult.data?.granted_days),
    (requestResult.data ?? []).map((row) => ({ ...row, days: numberValue(row.days) })) as HrLeaveRequest[],
    (supportResult.data ?? []).map((row) => ({ ...row, earned_days: numberValue(row.earned_days) })) as HrSupportRecord[],
  );
}

export async function loadHrLeaveDashboard(
  context: LeaveContext,
  year: number,
): Promise<HrLeaveDashboardData> {
  const { admin, workspaceId, user, isAdmin } = context;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const peoplePromise = loadWorkspacePeople(workspaceId);
  const membershipQuery = admin.from("workspace_members").select("user_id,created_at")
    .eq("workspace_id", workspaceId).limit(1000);
  const profileQuery = admin.from("hr_leave_profiles").select("user_id,employment_start_date")
    .eq("workspace_id", workspaceId);
  const grantQuery = admin.from("hr_annual_leave_grants").select("user_id,granted_days")
    .eq("workspace_id", workspaceId).eq("grant_year", year);
  let requestQuery = admin.from("hr_leave_requests").select("id,user_id,leave_date,unit,days,reason,status,review_note,created_at")
    .eq("workspace_id", workspaceId).gte("leave_date", start).lte("leave_date", end).order("leave_date", { ascending: false });
  let supportQuery = admin.from("hr_leave_support_records").select("id,user_id,support_date,support_type,unit,earned_days,note,status,review_note,created_at")
    .eq("workspace_id", workspaceId).gte("support_date", start).lte("support_date", end).order("support_date", { ascending: false });
  if (!isAdmin) {
    requestQuery = requestQuery.eq("user_id", user.id);
    supportQuery = supportQuery.eq("user_id", user.id);
  }
  const [people, memberships, profiles, grants, requests, supports] = await Promise.all([
    peoplePromise,
    membershipQuery,
    profileQuery,
    grantQuery,
    requestQuery,
    supportQuery,
  ]);
  const error = memberships.error ?? profiles.error ?? grants.error ?? requests.error ?? supports.error;
  if (error) throw migrationError(error.message);

  const joinedByUser = new Map((memberships.data ?? []).map((row) => [row.user_id, row.created_at.slice(0, 10)]));
  const profileByUser = new Map((profiles.data ?? []).map((row) => [row.user_id, row.employment_start_date]));
  const grantByUser = new Map((grants.data ?? []).map((row) => [row.user_id, numberValue(row.granted_days)]));
  const normalizedRequests = (requests.data ?? []).map((row) => ({ ...row, days: numberValue(row.days) })) as HrLeaveRequest[];
  const normalizedSupports = (supports.data ?? []).map((row) => ({ ...row, earned_days: numberValue(row.earned_days) })) as HrSupportRecord[];
  const visiblePeople = isAdmin ? people : people.filter((person) => person.id === user.id);

  return {
    today: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    year,
    userId: user.id,
    isAdmin,
    people: visiblePeople.map((person) => {
      const personRequests = normalizedRequests.filter((request) => request.user_id === person.id);
      const personSupports = normalizedSupports.filter((record) => record.user_id === person.id);
      const joinedAt = joinedByUser.get(person.id) ?? `${year}-01-01`;
      const profileDate = profileByUser.get(person.id);
      const balance = leaveBalance(grantByUser.get(person.id) ?? 0, personRequests, personSupports);
      return {
        ...person,
        joinedAt,
        employmentStartDate: profileDate ?? joinedAt,
        profileSaved: Boolean(profileDate),
        baseGranted: balance.baseGranted,
        extraGranted: balance.extraGranted,
        used: balance.used,
        pending: balance.pending,
        remaining: balance.remaining,
      };
    }),
    requests: normalizedRequests,
    supportRecords: normalizedSupports,
  };
}
