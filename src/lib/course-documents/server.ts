import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CourseDocumentBlock, CourseDocumentDetail, CourseDocumentSummary } from "./types";
import { courseDocumentContentSchema, slugBase } from "./validation";

export const COURSE_DOCUMENT_IMAGE_BUCKET = "course-document-images";

export async function requireCourseDocumentMember() {
  const supabase = await createClient();
  const user = await requireCourseOperationsUser(supabase);
  const membership = await requireCourseOperationsMembership(user.id);
  return { user, membership, admin: createAdminClient() };
}

export async function getExternalCourse(accessToken: string) {
  if (!/^[a-f0-9]{48}$/u.test(accessToken)) throw new Error("NOT_FOUND");
  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("course_document_settings")
    .select("course_id,workspace_id,external_edit_enabled,planning_sheet_url")
    .eq("external_access_token", accessToken)
    .maybeSingle();
  if (settingsError) throw new Error(`외부 작성 설정 조회 실패: ${settingsError.code}`);
  if (!settings) throw new Error("NOT_FOUND");
  if (!settings.external_edit_enabled) throw new Error("EXTERNAL_DISABLED");

  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id,name,instructor_name,cohort")
    .eq("id", settings.course_id)
    .eq("workspace_id", settings.workspace_id)
    .maybeSingle();
  if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
  if (!course) throw new Error("NOT_FOUND");
  return { admin, settings, course };
}

export function toDocumentSummary(row: Record<string, unknown>): CourseDocumentSummary {
  const leadRelation = row.course_document_leads;
  const leadCount = Array.isArray(leadRelation)
    ? Number((leadRelation[0] as { count?: number } | undefined)?.count ?? 0)
    : typeof leadRelation === "object" && leadRelation !== null
      ? Number((leadRelation as { count?: number }).count ?? 0)
      : Number(row.lead_count ?? 0);
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    instructorName: String(row.instructor_name ?? ""),
    title: String(row.title),
    slug: String(row.slug),
    status: row.status === "published" ? "published" : "draft",
    leadGateEnabled: Boolean(row.lead_gate_enabled),
    leadGateAfterBlockId: typeof row.lead_gate_after_block_id === "string" ? row.lead_gate_after_block_id : null,
    leadCount,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
  };
}

export function toDocumentDetail(row: Record<string, unknown>): CourseDocumentDetail {
  return {
    ...toDocumentSummary(row),
    content: courseDocumentContentSchema.parse(row.content) as CourseDocumentBlock[],
  };
}

export async function createUniqueDocumentSlug(title: string) {
  const admin = createAdminClient();
  const base = slugBase(title);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = randomBytes(4).toString("hex");
    const slug = `${base}-${suffix}`.slice(0, 120);
    const { data, error } = await admin.from("course_documents").select("id").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`문서 주소 확인 실패: ${error.code}`);
    if (!data) return slug;
  }
  throw new Error("문서 주소를 생성하지 못했습니다. 다시 시도해 주세요.");
}

function unlockSecret() {
  const secret = process.env.COURSE_DOCUMENT_UNLOCK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("문서 잠금 해제 서명 키가 설정되지 않았습니다.");
  return secret;
}

export function unlockCookieName(documentId: string) {
  return `cd_unlock_${documentId.replace(/-/gu, "")}`;
}

export function createUnlockToken(documentId: string, expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30) {
  const payload = `${documentId}.${expiresAt}`;
  const signature = createHmac("sha256", unlockSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyUnlockToken(token: string | undefined, documentId: string) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [tokenDocumentId, expiresRaw, signature] = decoded.split(".");
    if (tokenDocumentId !== documentId || !expiresRaw || !signature || Number(expiresRaw) <= Date.now()) return false;
    const expected = createHmac("sha256", unlockSecret())
      .update(`${tokenDocumentId}.${expiresRaw}`)
      .digest("base64url");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function courseDocumentErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  if (message === "UNAUTHORIZED") return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (message === "FORBIDDEN") return Response.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  if (message === "NOT_FOUND") return Response.json({ message: "대상을 찾을 수 없습니다." }, { status: 404 });
  if (message === "EXTERNAL_DISABLED") return Response.json({ message: "현재 외부 문서 작성이 비활성화되어 있습니다." }, { status: 403 });
  if (error instanceof ZodError) return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  return Response.json({
    message: /PGRST20[45]|42P01|42703/u.test(message)
      ? "인스타그램 문서 관리 DB 마이그레이션을 먼저 적용해 주세요."
      : message,
  }, { status: 400 });
}
