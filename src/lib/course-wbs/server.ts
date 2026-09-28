import "server-only";

import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WBS_TEMPLATE } from "./default-template";
import { peopleInItems, selectablePeople, hasNewInactiveAssignment } from "./people";
import { loadWorkspacePeople } from "@/lib/work-tasks/server";
import { syncWebinarItem, webinarDateFromTimestamp, WEBINAR_ITEM_ID } from "./webinar-date";
import type {
  CourseWbs,
  CourseWbsBootstrap,
  WbsCourse,
  WbsItem,
  WbsSummary,
  WbsTemplate,
} from "./types";
import {
  parseWbsCourseId,
  parseWbsItems,
  parseWbsTemplateId,
  WbsInputError,
} from "./validation";

const WBS_COLUMNS = "course_id,items,updated_at";
const TEMPLATE_COLUMNS = "id,name,items,updated_at";
const PEOPLE_PAGE_SIZE = 1000;

async function loadInactivePeople(workspaceId: string) {
  const people = await loadWorkspacePeople(workspaceId, true);
  return [...new Set(people.filter(person => !person.active).flatMap(person => person.accountNames))];
}

async function assertAssignablePeople(workspaceId: string, items: WbsItem[], previous: WbsItem[]) {
  if (hasNewInactiveAssignment(items, previous, await loadInactivePeople(workspaceId))) {
    throw new WbsInputError("비활성화된 사용자는 새 업무 담당자 또는 관계자로 지정할 수 없습니다.");
  }
}

type WbsRow = {
  course_id: string;
  items: unknown;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  name: string;
  items: unknown;
  updated_at: string;
};

function missingPeopleTable(code?: string): boolean {
  return code === "PGRST205" || code === "42P01";
}

async function loadStoredPeople(workspaceId: string): Promise<string[]> {
  const admin = createAdminClient();
  const names = new Set<string>();
  for (const [table, orderColumn] of [
    ["course_wbs", "course_id"],
    ["course_wbs_templates", "id"],
  ] as const) {
    for (let offset = 0; ; offset += PEOPLE_PAGE_SIZE) {
      const { data, error } = await admin
        .from(table)
        .select("items")
        .eq("workspace_id", workspaceId)
        .order(orderColumn, { ascending: true })
        .range(offset, offset + PEOPLE_PAGE_SIZE - 1);
      if (error) throw databaseError("담당자 목록 조회", error.code);
      for (const row of data ?? []) {
        for (const name of peopleInItems(row.items)) names.add(name);
      }
      if (!data || data.length < PEOPLE_PAGE_SIZE) break;
    }
  }
  return [...names];
}

async function loadWbsPeople(workspaceId: string): Promise<string[]> {
  const admin = createAdminClient();
  const people: string[] = [];
  for (let offset = 0; ; offset += PEOPLE_PAGE_SIZE) {
    const { data, error } = await admin
      .from("course_wbs_people")
      .select("name")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true })
      .range(offset, offset + PEOPLE_PAGE_SIZE - 1);
    if (error) {
      if (missingPeopleTable(error.code)) return loadStoredPeople(workspaceId);
      throw databaseError("담당자 목록 조회", error.code);
    }
    people.push(...(data ?? []).map((row) => row.name));
    if (!data || data.length < PEOPLE_PAGE_SIZE) return people;
  }
}

async function loadWbsSummaries(workspaceId: string): Promise<WbsSummary[]> {
  const admin = createAdminClient();
  const summaries: WbsSummary[] = [];
  for (let offset = 0; ; offset += PEOPLE_PAGE_SIZE) {
    const { data, error } = await admin
      .from("course_wbs")
      .select(WBS_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .order("course_id", { ascending: true })
      .range(offset, offset + PEOPLE_PAGE_SIZE - 1);
    if (error) throw databaseError("WBS 목록 조회", error.code);
    for (const row of data ?? []) {
      const items = parseWbsItems(row.items);
      summaries.push({
        courseId: row.course_id,
        itemCount: items.length,
        completedCount: items.filter((item) => item.completed).length,
        updatedAt: row.updated_at,
      });
    }
    if (!data || data.length < PEOPLE_PAGE_SIZE) return summaries;
  }
}

function sortedEmployeeNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string")
    .map((name) => name.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));
}

async function loadWbsEmployeeNames(workspaceId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("course_wbs_employee_names", { p_workspace_id: workspaceId });
  if (!error) return sortedEmployeeNames(data);
  if (error.code !== "PGRST202" && error.code !== "42883") {
    throw databaseError("직원 목록 조회", error.code);
  }

  // Keep linked, active personnel available until the names-only RPC is installed.
  const fallback = await admin.rpc("personnel_directory", { p_workspace_id: workspaceId });
  if (fallback.error) {
    if (fallback.error.code === "PGRST202" || fallback.error.code === "42883") return [];
    throw databaseError("직원 목록 조회", fallback.error.code);
  }
  const directory = Array.isArray(fallback.data) ? fallback.data : [];
  return sortedEmployeeNames(directory.filter((row) => row && typeof row === "object" && row.active === true)
    .map((row) => row.name));
}

async function saveWbsPeople(workspaceId: string, items: WbsItem[]): Promise<void> {
  const names = peopleInItems(items);
  if (names.length === 0) return;
  const { error } = await createAdminClient()
    .from("course_wbs_people")
    .upsert(names.map((name) => ({ workspace_id: workspaceId, name })), {
      onConflict: "workspace_id,name",
      ignoreDuplicates: true,
    });
  if (error && !missingPeopleTable(error.code)) {
    throw databaseError("담당자 목록 저장", error.code);
  }
}

class WbsNotFoundError extends Error {}
class WbsUnauthorizedError extends Error {}
class WbsConflictError extends Error {
  constructor() {
    super("다른 사용자가 먼저 수정했습니다. 최신 내용을 다시 불러와 주세요.");
  }
}

export async function requireWbsContext() {
  const client = await createClient();
  const user = await getAuthenticatedUser(client);
  if (!user) throw new WbsUnauthorizedError("로그인이 필요합니다.");
  const membership = await requireCourseOperationsMembership(user.id);
  return { workspaceId: membership.workspace_id, actorId: user.id };
}

export function wbsApiError(error: unknown): Response {
  if (error instanceof WbsUnauthorizedError) {
    return Response.json({ message: error.message }, { status: 401 });
  }
  if (error instanceof WbsNotFoundError) {
    return Response.json({ message: error.message }, { status: 404 });
  }
  if (error instanceof WbsConflictError) {
    return Response.json({ message: error.message }, { status: 409 });
  }
  if (error instanceof WbsInputError || error instanceof SyntaxError) {
    return Response.json(
      { message: error instanceof SyntaxError ? "요청 내용을 확인해 주세요." : error.message },
      { status: 400 },
    );
  }
  console.error("WBS API error", error);
  return Response.json({ message: "WBS 요청을 처리하지 못했습니다." }, { status: 500 });
}

function toWbs(row: WbsRow): CourseWbs {
  return {
    courseId: row.course_id,
    items: parseWbsItems(row.items),
    updatedAt: row.updated_at,
  };
}

function toTemplate(row: TemplateRow): WbsTemplate {
  const builtIn = row.id === DEFAULT_WBS_TEMPLATE.id;
  const items = parseWbsItems(row.items);
  const anchor = items.find((item) => item.id === WEBINAR_ITEM_ID || item.title.replace(/\s+/gu, "") === "무료웨비나");
  return {
    id: row.id,
    name: row.name,
    items: syncWebinarItem(items, anchor?.dueDate || anchor?.startDate || ""),
    updatedAt: row.updated_at,
    builtIn,
    ...(builtIn ? { sourceUrl: DEFAULT_WBS_TEMPLATE.sourceUrl } : {}),
  };
}

function builtInTemplate(): WbsTemplate {
  return {
    id: DEFAULT_WBS_TEMPLATE.id,
    name: DEFAULT_WBS_TEMPLATE.name,
    items: parseWbsItems(DEFAULT_WBS_TEMPLATE.items),
    updatedAt: null,
    builtIn: true,
    sourceUrl: DEFAULT_WBS_TEMPLATE.sourceUrl,
  };
}

function databaseError(action: string, code?: string): Error {
  if (code === "PGRST205" || code === "42P01") {
    return new Error("WBS 데이터베이스 마이그레이션을 먼저 적용해 주세요.");
  }
  return new Error(`WBS ${action} 실패: ${code ?? "UNKNOWN"}`);
}

async function loadActiveTemplateRow(workspaceId: string): Promise<TemplateRow | null> {
  const { data, error } = await createAdminClient()
    .from("course_wbs_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw databaseError("템플릿 조회", error.code);
  return data as TemplateRow | null;
}

async function assertCourse(workspaceId: string, courseId: string): Promise<string | null> {
  parseWbsCourseId(courseId);
  const { data, error } = await createAdminClient()
    .from("courses")
    .select("id,free_webinar_at")
    .eq("workspace_id", workspaceId)
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw databaseError("강의 확인", error.code);
  if (!data) throw new WbsNotFoundError("강의를 찾을 수 없습니다.");
  return data.free_webinar_at;
}

export async function loadCourseWbsBootstrap(
  workspaceId: string,
): Promise<CourseWbsBootstrap> {
  const admin = createAdminClient();
  const [coursesResult, activeTemplateRow, savedPeople, employeeNames, wbsSummaries, inactivePeople] = await Promise.all([
    admin
      .from("courses")
      .select("id,name,cohort,instructor_name,free_webinar_at")
      .eq("workspace_id", workspaceId)
      .order("free_webinar_at", { ascending: false }),
    loadActiveTemplateRow(workspaceId),
    loadWbsPeople(workspaceId),
    loadWbsEmployeeNames(workspaceId),
    loadWbsSummaries(workspaceId),
    loadInactivePeople(workspaceId),
  ]);
  if (coursesResult.error) {
    throw databaseError("강의 목록 조회", coursesResult.error.code);
  }
  const courses: WbsCourse[] = (coursesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    cohort: row.cohort ?? "",
    instructorName: row.instructor_name ?? "",
    webinarAt: row.free_webinar_at,
  }));
  const template = activeTemplateRow ? toTemplate(activeTemplateRow) : builtInTemplate();
  return {
    courses,
    wbsSummaries,
    template,
    people: selectablePeople([...savedPeople, ...peopleInItems(template.items)], inactivePeople)
      .sort((a, b) => a.localeCompare(b, "ko")),
    employeeNames: selectablePeople(employeeNames, inactivePeople),
    inactivePeople,
  };
}

export async function loadCourseWbs(
  workspaceId: string,
  courseId: string,
): Promise<{ wbs: CourseWbs | null; webinarAt: string | null }> {
  const webinarAt = await assertCourse(workspaceId, courseId);
  const { data, error } = await createAdminClient()
    .from("course_wbs")
    .select(WBS_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw databaseError("조회", error.code);
  return { wbs: data ? toWbs(data as WbsRow) : null, webinarAt };
}

export async function saveCourseWbs(
  workspaceId: string,
  actorId: string,
  courseId: string,
  items: WbsItem[],
  expectedUpdatedAt: string | null,
): Promise<{ wbs: CourseWbs; webinarAt: string | null }> {
  const webinarAt = await assertCourse(workspaceId, courseId);
  const normalizedItems = parseWbsItems(syncWebinarItem(items, webinarDateFromTimestamp(webinarAt)));
  const previous = expectedUpdatedAt === null ? null : (await loadCourseWbs(workspaceId, courseId)).wbs;
  await assertAssignablePeople(workspaceId, normalizedItems, previous?.items ?? []);
  await saveWbsPeople(workspaceId, normalizedItems);
  const admin = createAdminClient();
  if (expectedUpdatedAt === null) {
    const { data, error } = await admin
      .from("course_wbs")
      .insert({ course_id: courseId, workspace_id: workspaceId, items: normalizedItems, updated_by: actorId })
      .select(WBS_COLUMNS)
      .single();
    if (error?.code === "23505") throw new WbsConflictError();
    if (error || !data) throw databaseError("저장", error?.code);
    return { wbs: toWbs(data as WbsRow), webinarAt };
  }
  const { data, error } = await admin
    .from("course_wbs")
    .update({ items: normalizedItems, updated_by: actorId })
    .eq("workspace_id", workspaceId)
    .eq("course_id", courseId)
    .eq("updated_at", expectedUpdatedAt)
    .select(WBS_COLUMNS)
    .maybeSingle();
  if (error) throw databaseError("저장", error.code);
  if (!data) throw new WbsConflictError();
  return { wbs: toWbs(data as WbsRow), webinarAt };
}

export async function deleteCourseWbs(workspaceId: string, courseId: string): Promise<void> {
  await assertCourse(workspaceId, courseId);
  const { error } = await createAdminClient()
    .from("course_wbs")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("course_id", courseId);
  if (error) throw databaseError("삭제", error.code);
}

export async function updateWbsTemplate(
  workspaceId: string,
  actorId: string,
  templateId: string,
  input: { name: string; items: WbsItem[]; expectedUpdatedAt: string | null },
): Promise<WbsTemplate> {
  parseWbsTemplateId(templateId);
  const anchor = input.items.find((item) => item.id === WEBINAR_ITEM_ID || item.title.replace(/\s+/gu, "") === "무료웨비나");
  const normalizedItems = parseWbsItems(syncWebinarItem(input.items, anchor?.dueDate || anchor?.startDate || ""));
  const activeTemplateRow = await loadActiveTemplateRow(workspaceId);
  await assertAssignablePeople(workspaceId, normalizedItems, activeTemplateRow ? parseWbsItems(activeTemplateRow.items) : []);
  if (
    activeTemplateRow
      ? activeTemplateRow.id !== templateId || activeTemplateRow.updated_at !== input.expectedUpdatedAt
      : templateId !== DEFAULT_WBS_TEMPLATE.id || input.expectedUpdatedAt !== null
  ) {
    throw new WbsConflictError();
  }
  await saveWbsPeople(workspaceId, normalizedItems);
  const admin = createAdminClient();
  if (!activeTemplateRow) {
    const { data, error } = await admin
      .from("course_wbs_templates")
      .insert({
        workspace_id: workspaceId,
        id: templateId,
        name: input.name,
        items: normalizedItems,
        updated_by: actorId,
      })
      .select(TEMPLATE_COLUMNS)
      .single();
    if (error?.code === "23505") throw new WbsConflictError();
    if (error || !data) throw databaseError("기본 템플릿 저장", error?.code);
    return toTemplate(data as TemplateRow);
  }
  const { data, error } = await admin
    .from("course_wbs_templates")
    .update({ name: input.name, items: normalizedItems, updated_by: actorId })
    .eq("workspace_id", workspaceId)
    .eq("id", templateId)
    .eq("updated_at", activeTemplateRow.updated_at)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error) throw databaseError("템플릿 수정", error.code);
  if (!data) throw new WbsConflictError();
  return toTemplate(data as TemplateRow);
}
