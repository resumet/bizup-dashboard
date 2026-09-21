import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getHolidayPreset } from "@hyunbinseo/holidays-kr";

import { toKoreaDate } from "@/lib/course-operations/schedule";
import { COURSE_NOTE_MAX_LENGTH } from "@/lib/course-operations/notes";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConfirmedCourseSchedule,
  CourseScheduleDraft,
  CourseScheduleDraftSize,
  CourseSchedulePlannerData,
} from "./types";

const ENTITY_TYPE = "course_schedule_draft";
const CREATED_EVENT = "course_schedule_draft.created";
const UPDATED_EVENT = "course_schedule_draft.updated";
const DELETED_EVENT = "course_schedule_draft.deleted";
const COLOR_COUNT = 10;
const DRAFT_COLUMNS =
  "id,instructor_name,topic,memo,course_size,color_index,scheduled_date,created_at,updated_at";

type CourseScheduleDraftRow = {
  id: string;
  instructor_name: string;
  topic: string;
  memo: string;
  course_size: string;
  color_index: number;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function dateOrNull(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

export function parseCourseSize(value: unknown): CourseScheduleDraftSize {
  if (value === "large" || value === "small") return value;
  throw new Error("강의 규모를 선택해 주세요.");
}

export function toCourseScheduleDraft(
  row: CourseScheduleDraftRow,
): CourseScheduleDraft {
  return {
    id: row.id,
    instructorName: row.instructor_name,
    topic: row.topic,
    memo: row.memo,
    courseSize: row.course_size === "small" ? "small" : "large",
    colorIndex: row.color_index,
    scheduledDate: row.scheduled_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadKoreanHolidays(years: number[]) {
  const entries = await Promise.all(years.map(async (year) => {
    try {
      return Object.entries(await getHolidayPreset(String(year)));
    } catch {
      return [];
    }
  }));
  return Object.fromEntries(entries.flat()) as Record<string, string[]>;
}

async function loadDrafts(client: SupabaseClient, workspaceId: string) {
  const { data, error } = await client
    .from("course_schedule_drafts")
    .select(DRAFT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(
      error.code === "PGRST205" || error.code === "42P01"
        ? "예비 강의 DB 마이그레이션을 먼저 적용해 주세요."
        : `예비 강의 조회 실패: ${error.code}`,
    );
  }
  return ((data ?? []) as CourseScheduleDraftRow[]).map(toCourseScheduleDraft);
}

export async function loadCourseSchedulePlanner(
  workspaceId: string,
): Promise<CourseSchedulePlannerData> {
  const admin = createAdminClient();
  const today = toKoreaDate(new Date().toISOString());
  const currentYear = Number(today.slice(0, 4));
  const [drafts, coursesResult, holidays] = await Promise.all([
    loadDrafts(admin, workspaceId),
    admin
      .from("courses")
      .select("id,name,instructor_name,cohort,free_webinar_at")
      .eq("workspace_id", workspaceId)
      .order("free_webinar_at", { ascending: true }),
    loadKoreanHolidays([currentYear - 1, currentYear, currentYear + 1]),
  ]);
  if (coursesResult.error) {
    throw new Error(`확정 강의 일정 조회 실패: ${coursesResult.error.code}`);
  }
  const confirmedCourses: ConfirmedCourseSchedule[] = (coursesResult.data ?? [])
    .map((course) => ({
      id: course.id,
      name: course.name,
      instructorName: course.instructor_name,
      cohort: course.cohort ?? "",
      webinarDate: toKoreaDate(course.free_webinar_at),
    }))
    .filter((course) => course.webinarDate);
  return {
    drafts,
    confirmedCourses,
    today,
    holidays,
  };
}

async function appendAuditEvent(
  client: SupabaseClient,
  workspaceId: string,
  actorId: string,
  eventType: string,
  entityId: string,
  metadata: unknown,
) {
  const { error } = await client.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    event_type: eventType,
    entity_type: ENTITY_TYPE,
    entity_id: entityId,
    metadata,
  });
  if (error) {
    console.error(`예비 강의 감사 로그 저장 실패: ${error.code}`);
  }
}

export function parseDraftText(value: unknown, field: "강사명" | "강의주제") {
  const maxLength = field === "강사명" ? 100 : 200;
  const parsed = text(value, maxLength);
  if (!parsed) throw new Error(`${field}을 입력해 주세요.`);
  return parsed;
}

export function parseDraftMemo(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error("메모 내용을 확인해 주세요.");
  const memo = value.trim();
  if (Array.from(memo).length > COURSE_NOTE_MAX_LENGTH) {
    throw new Error(
      `메모는 최대 ${COURSE_NOTE_MAX_LENGTH.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`,
    );
  }
  return memo;
}

export function parseScheduledDate(value: unknown) {
  if (value === null || value === "") return null;
  const parsed = dateOrNull(value);
  if (!parsed) throw new Error("일정 날짜를 확인해 주세요.");
  return parsed;
}

export async function createCourseScheduleDraft(
  workspaceId: string,
  actorId: string,
  input: {
    instructorName: unknown;
    topic: unknown;
    memo?: unknown;
    courseSize: unknown;
  },
) {
  const admin = createAdminClient();
  const current = await loadDrafts(admin, workspaceId);
  const now = new Date().toISOString();
  const draft: CourseScheduleDraft = {
    id: crypto.randomUUID(),
    instructorName: parseDraftText(input.instructorName, "강사명"),
    topic: parseDraftText(input.topic, "강의주제"),
    memo: parseDraftMemo(input.memo),
    courseSize: parseCourseSize(input.courseSize),
    colorIndex: current.length
      ? (Math.max(...current.map((item) => item.colorIndex)) + 1) % COLOR_COUNT
      : 0,
    scheduledDate: null,
    createdAt: now,
    updatedAt: now,
  };
  const { data, error } = await admin
    .from("course_schedule_drafts")
    .insert({
      id: draft.id,
      workspace_id: workspaceId,
      instructor_name: draft.instructorName,
      topic: draft.topic,
      memo: draft.memo,
      course_size: draft.courseSize,
      color_index: draft.colorIndex,
      scheduled_date: draft.scheduledDate,
      created_by: actorId,
      created_at: draft.createdAt,
      updated_at: draft.updatedAt,
    })
    .select(DRAFT_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`예비 강의 저장 실패: ${error?.code ?? "UNKNOWN"}`);
  }
  const created = toCourseScheduleDraft(data as CourseScheduleDraftRow);
  await appendAuditEvent(
    admin,
    workspaceId,
    actorId,
    CREATED_EVENT,
    created.id,
    created,
  );
  return created;
}

export async function updateCourseScheduleDraft(
  workspaceId: string,
  actorId: string,
  draftId: string,
  patch: {
    instructorName?: unknown;
    topic?: unknown;
    memo?: unknown;
    courseSize?: unknown;
    scheduledDate?: unknown;
  },
) {
  const admin = createAdminClient();
  const current = (await loadDrafts(admin, workspaceId)).find((draft) => draft.id === draftId);
  if (!current) throw new Error("예비 강의를 찾을 수 없습니다.");
  const draft: CourseScheduleDraft = {
    ...current,
    ...(Object.hasOwn(patch, "instructorName")
      ? { instructorName: parseDraftText(patch.instructorName, "강사명") }
      : {}),
    ...(Object.hasOwn(patch, "topic")
      ? { topic: parseDraftText(patch.topic, "강의주제") }
      : {}),
    ...(Object.hasOwn(patch, "memo")
      ? { memo: parseDraftMemo(patch.memo) }
      : {}),
    ...(Object.hasOwn(patch, "courseSize")
      ? { courseSize: parseCourseSize(patch.courseSize) }
      : {}),
    ...(Object.hasOwn(patch, "scheduledDate")
      ? { scheduledDate: parseScheduledDate(patch.scheduledDate) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("course_schedule_drafts")
    .update({
      instructor_name: draft.instructorName,
      topic: draft.topic,
      memo: draft.memo,
      course_size: draft.courseSize,
      color_index: draft.colorIndex,
      scheduled_date: draft.scheduledDate,
      updated_at: draft.updatedAt,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .select(DRAFT_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      error ? `예비 강의 수정 실패: ${error.code}` : "예비 강의를 찾을 수 없습니다.",
    );
  }
  const updated = toCourseScheduleDraft(data as CourseScheduleDraftRow);
  await appendAuditEvent(
    admin,
    workspaceId,
    actorId,
    UPDATED_EVENT,
    updated.id,
    updated,
  );
  return updated;
}

export async function loadCourseScheduleDraft(
  workspaceId: string,
  draftId: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_schedule_drafts")
    .select(DRAFT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`예비 강의 조회 실패: ${error.code}`);
  return data ? toCourseScheduleDraft(data as CourseScheduleDraftRow) : null;
}

export async function deleteCourseScheduleDraft(
  workspaceId: string,
  actorId: string,
  draftId: string,
) {
  const admin = createAdminClient();
  const current = await loadCourseScheduleDraft(workspaceId, draftId);
  if (!current) throw new Error("예비 강의를 찾을 수 없습니다.");
  const { data, error } = await admin
    .from("course_schedule_drafts")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      error ? `예비 강의 삭제 실패: ${error.code}` : "예비 강의를 찾을 수 없습니다.",
    );
  }
  await appendAuditEvent(
    admin,
    workspaceId,
    actorId,
    DELETED_EVENT,
    draftId,
    current,
  );
}
