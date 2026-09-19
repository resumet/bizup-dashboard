import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { toKoreaDate } from "@/lib/course-operations/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConfirmedCourseSchedule,
  CourseScheduleDraft,
  CourseScheduleDraftEvent,
  CourseSchedulePlannerData,
} from "./types";

const ENTITY_TYPE = "course_schedule_draft";
const UPSERT_EVENT = "course_schedule_draft.upserted";
const DELETE_EVENT = "course_schedule_draft.deleted";
const COLOR_COUNT = 10;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function dateOrNull(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function draftFromMetadata(id: string, metadata: unknown): CourseScheduleDraft | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const source = metadata as Record<string, unknown>;
  const instructorName = text(source.instructorName, 100);
  const topic = text(source.topic, 200);
  if (!instructorName || !topic) return null;
  const createdAt = text(source.createdAt, 40);
  const updatedAt = text(source.updatedAt, 40);
  return {
    id,
    instructorName,
    topic,
    colorIndex: Number.isInteger(source.colorIndex)
      ? Math.max(0, Number(source.colorIndex)) % COLOR_COUNT
      : 0,
    scheduledDate: dateOrNull(source.scheduledDate),
    createdAt,
    updatedAt,
  };
}

export function reduceCourseScheduleDraftEvents(events: CourseScheduleDraftEvent[]) {
  const drafts = new Map<string, CourseScheduleDraft>();
  for (const event of events) {
    if (!event.entity_id) continue;
    if (event.event_type === DELETE_EVENT) {
      drafts.delete(event.entity_id);
      continue;
    }
    if (event.event_type !== UPSERT_EVENT) continue;
    const draft = draftFromMetadata(event.entity_id, event.metadata);
    if (draft) drafts.set(event.entity_id, draft);
  }
  return [...drafts.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

async function loadDrafts(client: SupabaseClient, workspaceId: string) {
  const { data, error } = await client
    .from("audit_logs")
    .select("entity_id,event_type,metadata,created_at")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", ENTITY_TYPE)
    .in("event_type", [UPSERT_EVENT, DELETE_EVENT])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`예비 강의 조회 실패: ${error.code}`);
  return reduceCourseScheduleDraftEvents((data ?? []) as CourseScheduleDraftEvent[]);
}

export async function loadCourseSchedulePlanner(
  workspaceId: string,
): Promise<CourseSchedulePlannerData> {
  const admin = createAdminClient();
  const [drafts, coursesResult] = await Promise.all([
    loadDrafts(admin, workspaceId),
    admin
      .from("courses")
      .select("id,name,instructor_name,cohort,free_webinar_at")
      .eq("workspace_id", workspaceId)
      .order("free_webinar_at", { ascending: true }),
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
    today: toKoreaDate(new Date().toISOString()),
  };
}

async function appendEvent(
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
  if (error) throw new Error(`예비 강의 저장 실패: ${error.code}`);
}

export function parseDraftText(value: unknown, field: "강사명" | "강의주제") {
  const maxLength = field === "강사명" ? 100 : 200;
  const parsed = text(value, maxLength);
  if (!parsed) throw new Error(`${field}을 입력해 주세요.`);
  return parsed;
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
  input: { instructorName: unknown; topic: unknown },
) {
  const admin = createAdminClient();
  const current = await loadDrafts(admin, workspaceId);
  const now = new Date().toISOString();
  const draft: CourseScheduleDraft = {
    id: crypto.randomUUID(),
    instructorName: parseDraftText(input.instructorName, "강사명"),
    topic: parseDraftText(input.topic, "강의주제"),
    colorIndex: current.length
      ? (Math.max(...current.map((item) => item.colorIndex)) + 1) % COLOR_COUNT
      : 0,
    scheduledDate: null,
    createdAt: now,
    updatedAt: now,
  };
  await appendEvent(admin, workspaceId, actorId, UPSERT_EVENT, draft.id, draft);
  return draft;
}

export async function updateCourseScheduleDraft(
  workspaceId: string,
  actorId: string,
  draftId: string,
  patch: { instructorName?: unknown; topic?: unknown; scheduledDate?: unknown },
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
    ...(Object.hasOwn(patch, "scheduledDate")
      ? { scheduledDate: parseScheduledDate(patch.scheduledDate) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  await appendEvent(admin, workspaceId, actorId, UPSERT_EVENT, draft.id, draft);
  return draft;
}

export async function deleteCourseScheduleDraft(
  workspaceId: string,
  actorId: string,
  draftId: string,
) {
  const admin = createAdminClient();
  const current = (await loadDrafts(admin, workspaceId)).find((draft) => draft.id === draftId);
  if (!current) throw new Error("예비 강의를 찾을 수 없습니다.");
  await appendEvent(admin, workspaceId, actorId, DELETE_EVENT, draftId, current);
}
