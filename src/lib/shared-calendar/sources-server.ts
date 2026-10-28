import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalMarketingCreativeDaysBefore } from "@/lib/external-marketing/wbs";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkspacePeople } from "@/lib/work-tasks/server";
import { calendarContext, CalendarError } from "./server";
import {
  externalMarketingCreativeCalendarSource,
  leaveCalendarSources,
  webinarCalendarSource,
  type CalendarExternalMarketingProject,
  type CalendarLeave,
  type CalendarWebinar,
} from "./sources";
import type { CalendarSourceEvent } from "./types";

type Context = Awaited<ReturnType<typeof calendarContext>>;
type Range = { from: string; to: string };

export function calendarLeaveOption(value: string | null) {
  if (value === null || value === "false") return false;
  if (value === "true") return true;
  throw new CalendarError("직원 휴가 표시 옵션이 올바르지 않습니다.");
}

export async function loadCalendarWebinars(supabase: SupabaseClient, workspaceId: string, range: Range) {
  const until = new Date(`${range.to}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  const rows: CalendarSourceEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("courses").select("id,name,instructor_name,cohort,free_webinar_at,status")
      .eq("workspace_id", workspaceId).gte("free_webinar_at", `${range.from}T00:00:00+09:00`)
      .lt("free_webinar_at", `${until.toISOString().slice(0, 10)}T00:00:00+09:00`)
      .not("status", "in", "(on_hold,canceled)")
      .order("free_webinar_at").order("id").range(offset, offset + 499);
    if (error) throw new Error(`Calendar webinar lookup failed: ${error.code}`);
    for (const course of (data ?? []) as CalendarWebinar[]) {
      const event = webinarCalendarSource(course);
      if (event && event.event_date >= range.from && event.event_date <= range.to) rows.push(event);
    }
    if (!data || data.length < 500) return rows;
  }
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function loadCalendarExternalMarketingCreativeDates(supabase: SupabaseClient, workspaceId: string, range: Range) {
  const webinarFrom = shiftDateKey(range.from, externalMarketingCreativeDaysBefore);
  const webinarTo = shiftDateKey(range.to, externalMarketingCreativeDaysBefore);
  const rows: CalendarSourceEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("external_marketing_projects")
      .select("dashboard_id,course_name,instructor_name,cohort,webinar_date")
      .eq("workspace_id", workspaceId)
      .gte("webinar_date", webinarFrom)
      .lte("webinar_date", webinarTo)
      .order("webinar_date")
      .order("dashboard_id")
      .range(offset, offset + 499);
    if (error) throw new Error(`Calendar external marketing creative lookup failed: ${error.code}`);
    for (const project of (data ?? []) as CalendarExternalMarketingProject[]) {
      const event = externalMarketingCreativeCalendarSource(project);
      if (event && event.event_date >= range.from && event.event_date <= range.to) rows.push(event);
    }
    if (!data || data.length < 500) return rows;
  }
}

// Calendar members can share only approved dates/units, not the private HR rows.
// A fresh personnel access check gates this server-only service client projection.
export async function loadCalendarLeaves(context: Context, range: Range) {
  const admin = createAdminClient();
  const access = await admin.rpc("personnel_access", { p_workspace_id: context.workspaceId, p_user_id: context.user.id });
  if (access.error) throw new Error("Calendar leave personnel access lookup failed");
  if (access.data !== true) throw new CalendarError("직원 휴가를 보려면 활성 직원 권한이 필요합니다.", 403);
  async function loadRequests() {
    const requests: CalendarLeave[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("hr_leave_requests").select("id,user_id,leave_date,unit,status")
        .eq("workspace_id", context.workspaceId).eq("status", "approved")
        .gte("leave_date", range.from).lte("leave_date", range.to).order("leave_date").order("id").range(offset, offset + 499);
      if (error) throw new Error(`Calendar leave lookup failed: ${error.code}`);
      requests.push(...(data ?? []) as CalendarLeave[]);
      if (!data || data.length < 500) return requests;
    }
  }
  const [people, requests] = await Promise.all([loadWorkspacePeople(context.workspaceId), loadRequests()]);
  return leaveCalendarSources(requests, people);
}

export async function loadCalendarSources(context: Context, range: Range, includeLeaves = false) {
  const loaders = [
    { key: "webinar", label: "웨비나", promise: loadCalendarWebinars(context.supabase, context.workspaceId, range) },
    { key: "external-marketing-creative", label: "외부광고 소재전달일", promise: loadCalendarExternalMarketingCreativeDates(context.supabase, context.workspaceId, range) },
    { key: "leave", label: "직원 휴가", promise: includeLeaves ? loadCalendarLeaves(context, range) : Promise.resolve([]) },
  ];
  const results = await Promise.allSettled(loaders.map((loader) => loader.promise));
  const sources: CalendarSourceEvent[] = [];
  const warnings: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") sources.push(...result.value);
    else {
      const loader = loaders[index];
      console.error("shared_calendar_source_failed", loader.key, result.reason instanceof CalendarError ? result.reason.status : "LOOKUP_FAILED");
      warnings.push(result.reason instanceof CalendarError ? result.reason.message : `${loader.label} 일정을 불러오지 못했습니다. 새로고침해 주세요.`);
    }
  });
  return { sources, sourcesWarning: warnings.join(" ") };
}
