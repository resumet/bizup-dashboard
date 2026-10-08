import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAdminAccess } from "@/lib/admin/access";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { eventSchema, isDateKey, meetingTypeSchema, uuidSchema, versionSchema } from "./calendar";
import type { CalendarCourse, CalendarEvent, MeetingType } from "./types";

const EVENT_SELECT = "id,title,event_date,start_minutes,duration_minutes,meeting_type_id,course_id,notes,version,meeting_type:shared_calendar_meeting_types!shared_calendar_events_meeting_type_id_workspace_id_fkey(id,name,code),course:courses(id,name,instructor_name,cohort)";
const headers = { "Cache-Control": "private, no-store" };

export class CalendarError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function calendarResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export function calendarFailure(error: unknown) {
  if (error instanceof CalendarError) return calendarResponse({ message: error.message }, error.status);
  console.error("shared_calendar_request_failed", error instanceof Error ? error.message : "Unknown error");
  return calendarResponse({ message: "일정을 처리하지 못했습니다. 다시 시도해 주세요." }, 500);
}

function checkDatabase(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new CalendarError("이미 등록된 회의 항목입니다.", 409);
  if (error.code === "42501") throw new CalendarError("이 작업을 수행할 권한이 없습니다.", 403);
  if (error.code === "23503" || error.code === "23514") throw new CalendarError("회의 종류, 강의 또는 시간 조건을 확인해 주세요.");
  throw new Error(`Calendar database error: ${error.code ?? "UNKNOWN"}`);
}

export async function calendarContext(adminOnly = false) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) throw new CalendarError("로그인이 필요합니다.", 401);
  const membership = await requireCourseOperationsMembership(user.id);
  const isAdmin = hasAdminAccess(user.email, membership.role);
  if (adminOnly && !isAdmin) throw new CalendarError("관리자만 회의 항목을 추가할 수 있습니다.", 403);
  return { supabase, user, workspaceId: membership.workspace_id as string, isAdmin };
}

export function validateRange(from: string | null, to: string | null) {
  if (!from || !to || !isDateKey(from) || !isDateKey(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 62) {
    throw new CalendarError("조회 기간은 올바른 날짜의 63일 이내로 지정해 주세요.");
  }
  return { from, to };
}

export async function loadMeetingTypes(supabase: SupabaseClient, workspaceId: string): Promise<MeetingType[]> {
  const { data, error } = await supabase.from("shared_calendar_meeting_types").select("id,name,code").eq("workspace_id", workspaceId).order("created_at").order("name");
  checkDatabase(error);
  return data ?? [];
}

export async function loadCalendarEvents(supabase: SupabaseClient, workspaceId: string, options: { from?: string; to?: string; courseId?: string }): Promise<CalendarEvent[]> {
  const rows: CalendarEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from("shared_calendar_events").select(EVENT_SELECT).eq("workspace_id", workspaceId);
    if (options.from) query = query.gte("event_date", options.from);
    if (options.to) query = query.lte("event_date", options.to);
    if (options.courseId) query = query.eq("course_id", options.courseId);
    const { data, error } = await query.order("event_date").order("start_minutes").order("id").range(offset, offset + 499);
    checkDatabase(error);
    const page = (data ?? []) as unknown as CalendarEvent[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function loadCalendarCourses(supabase: SupabaseClient, workspaceId: string): Promise<CalendarCourse[]> {
  const rows: CalendarCourse[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("courses").select("id,name,instructor_name,cohort").eq("workspace_id", workspaceId).order("name").order("id").range(offset, offset + 499);
    checkDatabase(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function readCalendarBody(request: Request) {
  // Cookie-authenticated mutations must come from the same application origin.
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
    let allowed = false;
    try { const source = new URL(origin); allowed = ["http:", "https:"].includes(source.protocol) && source.host === host; } catch { /* Opaque/malformed origins are rejected. */ }
    if (!allowed) throw new CalendarError("다른 사이트에서 보낸 요청은 허용하지 않습니다.", 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new CalendarError("JSON 요청이 필요합니다.");
  try { return await request.json() as unknown; }
  catch { throw new CalendarError("요청 본문이 올바르지 않습니다."); }
}

export function parseVersion(body: unknown) {
  const parsed = versionSchema.safeParse(body);
  if (!parsed.success) throw new CalendarError("일정 버전이 올바르지 않습니다. 새로고침해 주세요.");
  return parsed.data.version;
}

export async function saveCalendarEvent(context: Awaited<ReturnType<typeof calendarContext>>, body: unknown, eventId?: string) {
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) throw new CalendarError(parsed.error.issues[0].message);
  const input = parsed.data;
  const { supabase, workspaceId, user } = context;
  const { data: type, error: typeError } = await supabase.from("shared_calendar_meeting_types").select("id,code").eq("workspace_id", workspaceId).eq("id", input.meetingTypeId).maybeSingle();
  checkDatabase(typeError);
  if (!type) throw new CalendarError("회의 종류를 찾을 수 없습니다.");
  if (input.courseId) {
    if (type.code !== "instructor_zoom") throw new CalendarError("강사 줌미팅에만 강의를 연결할 수 있습니다.");
    const { data: course, error } = await supabase.from("courses").select("id").eq("workspace_id", workspaceId).eq("id", input.courseId).maybeSingle();
    checkDatabase(error);
    if (!course) throw new CalendarError("연결할 강의를 찾을 수 없습니다.");
  }
  const row = { title: input.title, event_date: input.eventDate, start_minutes: input.startMinutes, duration_minutes: input.durationMinutes, meeting_type_id: input.meetingTypeId, course_id: input.courseId, notes: input.notes };
  const query = eventId
    ? supabase.from("shared_calendar_events").update(row).eq("id", eventId).eq("workspace_id", workspaceId).eq("version", parseVersion(body))
    : supabase.from("shared_calendar_events").insert({ ...row, workspace_id: workspaceId, created_by: user.id });
  const { data, error } = await query.select(EVENT_SELECT).maybeSingle();
  checkDatabase(error);
  if (!data) throw new CalendarError("일정이 변경되었거나 삭제되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  return data as unknown as CalendarEvent;
}

export function validateEventId(id: string) {
  if (!uuidSchema.safeParse(id).success) throw new CalendarError("일정 주소가 올바르지 않습니다.");
}

export async function deleteCalendarEvent(context: Awaited<ReturnType<typeof calendarContext>>, eventId: string, body: unknown) {
  const { data, error } = await context.supabase.from("shared_calendar_events").delete().eq("workspace_id", context.workspaceId).eq("id", eventId).eq("version", parseVersion(body)).select("id").maybeSingle();
  checkDatabase(error);
  if (!data) throw new CalendarError("일정이 변경되었거나 삭제되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
}

export async function addMeetingType(context: Awaited<ReturnType<typeof calendarContext>>, body: unknown) {
  if (!context.isAdmin) throw new CalendarError("관리자만 회의 항목을 추가할 수 있습니다.", 403);
  const parsed = meetingTypeSchema.safeParse(body);
  if (!parsed.success) throw new CalendarError(parsed.error.issues[0].message);
  const { data, error } = await context.supabase.from("shared_calendar_meeting_types").insert({ workspace_id: context.workspaceId, name: parsed.data.name }).select("id,name,code").single();
  checkDatabase(error);
  return data as MeetingType;
}
