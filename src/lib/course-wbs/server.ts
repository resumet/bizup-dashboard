import "server-only";

import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WBS_TEMPLATE } from "./default-template";
import type {
  CourseWbs,
  CourseWbsBootstrap,
  WbsCourse,
  WbsItem,
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
  return {
    id: row.id,
    name: row.name,
    items: parseWbsItems(row.items),
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

async function assertCourse(workspaceId: string, courseId: string): Promise<string> {
  parseWbsCourseId(courseId);
  const { data, error } = await createAdminClient()
    .from("courses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw databaseError("강의 확인", error.code);
  if (!data) throw new WbsNotFoundError("강의를 찾을 수 없습니다.");
  return courseId;
}

export async function loadCourseWbsBootstrap(
  workspaceId: string,
): Promise<CourseWbsBootstrap> {
  const admin = createAdminClient();
  const [coursesResult, templatesResult] = await Promise.all([
    admin
      .from("courses")
      .select("id,name,cohort,instructor_name,free_webinar_at")
      .eq("workspace_id", workspaceId)
      .order("free_webinar_at", { ascending: false }),
    admin
      .from("course_wbs_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }),
  ]);
  if (coursesResult.error) {
    throw databaseError("강의 목록 조회", coursesResult.error.code);
  }
  if (templatesResult.error) {
    throw databaseError("템플릿 목록 조회", templatesResult.error.code);
  }
  const courses: WbsCourse[] = (coursesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    cohort: row.cohort ?? "",
    instructorName: row.instructor_name ?? "",
    webinarAt: row.free_webinar_at,
  }));
  const storedTemplates = ((templatesResult.data ?? []) as TemplateRow[]).map(toTemplate);
  const defaultOverride = storedTemplates.find(
    (template) => template.id === DEFAULT_WBS_TEMPLATE.id,
  );
  return {
    courses,
    templates: [
      defaultOverride ?? builtInTemplate(),
      ...storedTemplates.filter((template) => template.id !== DEFAULT_WBS_TEMPLATE.id),
    ],
  };
}

export async function loadCourseWbs(
  workspaceId: string,
  courseId: string,
): Promise<CourseWbs | null> {
  await assertCourse(workspaceId, courseId);
  const { data, error } = await createAdminClient()
    .from("course_wbs")
    .select(WBS_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw databaseError("조회", error.code);
  return data ? toWbs(data as WbsRow) : null;
}

export async function saveCourseWbs(
  workspaceId: string,
  actorId: string,
  courseId: string,
  items: WbsItem[],
  expectedUpdatedAt: string | null,
): Promise<CourseWbs> {
  await assertCourse(workspaceId, courseId);
  const admin = createAdminClient();
  if (expectedUpdatedAt === null) {
    const { data, error } = await admin
      .from("course_wbs")
      .insert({ course_id: courseId, workspace_id: workspaceId, items, updated_by: actorId })
      .select(WBS_COLUMNS)
      .single();
    if (error?.code === "23505") throw new WbsConflictError();
    if (error || !data) throw databaseError("저장", error?.code);
    return toWbs(data as WbsRow);
  }
  const { data, error } = await admin
    .from("course_wbs")
    .update({ items, updated_by: actorId })
    .eq("workspace_id", workspaceId)
    .eq("course_id", courseId)
    .eq("updated_at", expectedUpdatedAt)
    .select(WBS_COLUMNS)
    .maybeSingle();
  if (error) throw databaseError("저장", error.code);
  if (!data) throw new WbsConflictError();
  return toWbs(data as WbsRow);
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

export async function createWbsTemplate(
  workspaceId: string,
  actorId: string,
  input: { name: string; items: WbsItem[] },
): Promise<WbsTemplate> {
  const { data, error } = await createAdminClient()
    .from("course_wbs_templates")
    .insert({
      workspace_id: workspaceId,
      id: crypto.randomUUID(),
      name: input.name,
      items: input.items,
      updated_by: actorId,
    })
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error || !data) throw databaseError("템플릿 생성", error?.code);
  return toTemplate(data as TemplateRow);
}

export async function updateWbsTemplate(
  workspaceId: string,
  actorId: string,
  templateId: string,
  input: { name: string; items: WbsItem[]; expectedUpdatedAt: string | null },
): Promise<WbsTemplate> {
  parseWbsTemplateId(templateId);
  const admin = createAdminClient();
  if (templateId === DEFAULT_WBS_TEMPLATE.id && input.expectedUpdatedAt === null) {
    const { data, error } = await admin
      .from("course_wbs_templates")
      .insert({
        workspace_id: workspaceId,
        id: templateId,
        name: input.name,
        items: input.items,
        updated_by: actorId,
      })
      .select(TEMPLATE_COLUMNS)
      .single();
    if (error?.code === "23505") throw new WbsConflictError();
    if (error || !data) throw databaseError("기본 템플릿 저장", error?.code);
    return toTemplate(data as TemplateRow);
  }
  if (input.expectedUpdatedAt === null) {
    throw new WbsInputError("템플릿 수정 기준 시각을 확인해 주세요. 최신 내용을 다시 불러와 주세요.");
  }
  const { data, error } = await admin
    .from("course_wbs_templates")
    .update({ name: input.name, items: input.items, updated_by: actorId })
    .eq("workspace_id", workspaceId)
    .eq("id", templateId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error) throw databaseError("템플릿 수정", error.code);
  if (!data) throw new WbsConflictError();
  return toTemplate(data as TemplateRow);
}

export async function deleteWbsTemplate(
  workspaceId: string,
  templateId: string,
): Promise<void> {
  parseWbsTemplateId(templateId);
  const { data, error } = await createAdminClient()
    .from("course_wbs_templates")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", templateId)
    .select("id");
  if (error) throw databaseError("템플릿 삭제", error.code);
  if (!data?.length && templateId !== DEFAULT_WBS_TEMPLATE.id) {
    throw new WbsNotFoundError("템플릿을 찾을 수 없습니다.");
  }
}
