import { randomBytes } from "node:crypto";
import { z } from "zod";

import { createUniqueDocumentSlug, courseDocumentErrorResponse, requireCourseDocumentAdmin, toDocumentSummary } from "@/lib/course-documents/server";
import type { BlockedPhone, CourseDocumentCourse, CourseDocumentLead } from "@/lib/course-documents/types";
import { adminCourseDocumentSchema, assertValidKoreanPhone, blockedPhoneSchema, courseDocumentTitleSchema } from "@/lib/course-documents/validation";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update-course-access"), courseId: z.uuid(), enabled: z.boolean(), regenerateToken: z.boolean().optional().default(false) }),
  z.object({ action: z.literal("create-document"), courseId: z.uuid(), title: courseDocumentTitleSchema }),
  z.object({ action: z.literal("save-document"), documentId: z.uuid(), document: adminCourseDocumentSchema }),
  z.object({ action: z.literal("delete-document"), documentId: z.uuid() }),
  z.object({ action: z.literal("add-blocked-phone"), phone: z.string(), memo: z.string().optional() }),
  z.object({ action: z.literal("delete-blocked-phone"), id: z.uuid() }),
]);

export async function GET() {
  try {
    const { membership, admin } = await requireCourseDocumentAdmin();
    const { data: courses, error: coursesError } = await admin
      .from("courses")
      .select("id,name,instructor_name,cohort,free_webinar_at")
      .eq("workspace_id", membership.workspace_id)
      .order("free_webinar_at", { ascending: false });
    if (coursesError) throw new Error(`강의 조회 실패: ${coursesError.code}`);

    const { data: existingSettings, error: settingsError } = await admin
      .from("course_document_settings")
      .select("course_id,external_edit_enabled,external_access_token")
      .eq("workspace_id", membership.workspace_id);
    if (settingsError) throw new Error(`외부 작성 설정 조회 실패: ${settingsError.code}`);

    const existingCourseIds = new Set((existingSettings ?? []).map((item) => item.course_id));
    const missing = (courses ?? []).filter((course) => !existingCourseIds.has(course.id));
    if (missing.length) {
      const { error } = await admin.from("course_document_settings").insert(
        missing.map((course) => ({ course_id: course.id, workspace_id: membership.workspace_id })),
      );
      if (error && error.code !== "23505") throw new Error(`외부 작성 설정 생성 실패: ${error.code}`);
    }

    const [settingsResult, documentsResult, leadsResult, blockedResult] = await Promise.all([
      admin.from("course_document_settings").select("course_id,external_edit_enabled,external_access_token").eq("workspace_id", membership.workspace_id),
      admin.from("course_documents").select("id,course_id,instructor_name,title,slug,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at,course_document_leads(count)").eq("workspace_id", membership.workspace_id).is("deleted_at", null).order("updated_at", { ascending: false }),
      admin.from("course_document_leads").select("id,document_id,course_id,instructor_name,name,phone,utm_source,utm_medium,utm_campaign,utm_content,referrer,created_at,course_documents!inner(title),courses!inner(name)").eq("workspace_id", membership.workspace_id).order("created_at", { ascending: false }).limit(10_000),
      admin.from("course_document_blocked_phones").select("id,phone_normalized,memo,created_at").eq("workspace_id", membership.workspace_id).order("created_at", { ascending: false }),
    ]);
    const queryError = settingsResult.error ?? documentsResult.error ?? leadsResult.error ?? blockedResult.error;
    if (queryError) throw new Error(`인스타그램 문서 관리 조회 실패: ${queryError.code}`);

    const leads: CourseDocumentLead[] = (leadsResult.data ?? []).map((row) => {
      const document = Array.isArray(row.course_documents) ? row.course_documents[0] : row.course_documents;
      const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
      return {
        id: row.id,
        documentId: row.document_id,
        documentTitle: document?.title ?? "",
        courseId: row.course_id,
        courseName: course?.name ?? "",
        instructorName: row.instructor_name,
        name: row.name,
        phone: row.phone,
        utmSource: row.utm_source ?? "",
        utmMedium: row.utm_medium ?? "",
        utmCampaign: row.utm_campaign ?? "",
        utmContent: row.utm_content ?? "",
        referrer: row.referrer ?? "",
        createdAt: row.created_at,
      };
    });
    const documents = (documentsResult.data ?? []).map((row) => toDocumentSummary(row));
    const settingsByCourse = new Map((settingsResult.data ?? []).map((item) => [item.course_id, item] as const));
    const courseItems: CourseDocumentCourse[] = (courses ?? []).map((course) => {
      const setting = settingsByCourse.get(course.id);
      return {
        id: course.id,
        name: course.name,
        instructorName: course.instructor_name,
        cohort: course.cohort ?? "",
        freeWebinarAt: course.free_webinar_at,
        externalEditEnabled: setting?.external_edit_enabled ?? false,
        externalAccessToken: setting?.external_access_token ?? "",
        documents: documents.filter((document) => document.courseId === course.id),
      };
    });
    const blockedPhones: BlockedPhone[] = (blockedResult.data ?? []).map((row) => ({
      id: row.id,
      phone: row.phone_normalized,
      memo: row.memo,
      createdAt: row.created_at,
    }));
    return Response.json({ courses: courseItems, leads, blockedPhones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, membership, admin } = await requireCourseDocumentAdmin();
    const input = requestSchema.parse(await request.json());

    if (input.action === "update-course-access") {
      const { data: course } = await admin.from("courses").select("id").eq("id", input.courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
      if (!course) throw new Error("NOT_FOUND");
      const values: Record<string, unknown> = {
        course_id: input.courseId,
        workspace_id: membership.workspace_id,
        external_edit_enabled: input.enabled,
      };
      if (input.regenerateToken) values.external_access_token = randomBytes(24).toString("hex");
      const { data, error } = await admin.from("course_document_settings").upsert(values, { onConflict: "course_id" }).select("external_edit_enabled,external_access_token").single();
      if (error) throw new Error(`외부 작성 설정 저장 실패: ${error.code}`);
      return Response.json({ setting: { enabled: data.external_edit_enabled, accessToken: data.external_access_token } });
    }

    if (input.action === "create-document") {
      const { data: course } = await admin.from("courses").select("id,instructor_name").eq("id", input.courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
      if (!course) throw new Error("NOT_FOUND");
      const slug = await createUniqueDocumentSlug(input.title);
      const { data, error } = await admin.from("course_documents").insert({
        workspace_id: membership.workspace_id,
        course_id: course.id,
        instructor_name: course.instructor_name,
        title: input.title,
        slug,
        content: [],
        created_by: user.id,
        updated_by: user.id,
      }).select("id").single();
      if (error) throw new Error(`문서 생성 실패: ${error.code}`);
      return Response.json({ id: data.id }, { status: 201 });
    }

    if (input.action === "save-document") {
      const { data: existing } = await admin.from("course_documents").select("id,status").eq("id", input.documentId).eq("workspace_id", membership.workspace_id).is("deleted_at", null).maybeSingle();
      if (!existing) throw new Error("NOT_FOUND");
      const document = input.document;
      const values: Record<string, unknown> = {
        title: document.title,
        content: document.content,
        status: document.status,
        lead_gate_enabled: document.leadGateEnabled,
        lead_gate_after_block_id: document.leadGateEnabled ? document.leadGateAfterBlockId : null,
        updated_by: user.id,
      };
      if (document.status === "draft") values.published_at = null;
      if (document.status === "published" && existing.status !== "published") values.published_at = new Date().toISOString();
      const { error } = await admin.from("course_documents").update(values).eq("id", input.documentId).eq("workspace_id", membership.workspace_id);
      if (error) throw new Error(`문서 저장 실패: ${error.code}`);
      return Response.json({ success: true });
    }

    if (input.action === "delete-document") {
      const { data, error } = await admin.from("course_documents").update({
        deleted_at: new Date().toISOString(), status: "draft", published_at: null,
        lead_gate_enabled: false, lead_gate_after_block_id: null, updated_by: user.id,
      }).eq("id", input.documentId).eq("workspace_id", membership.workspace_id).is("deleted_at", null).select("id").maybeSingle();
      if (error) throw new Error(`문서 삭제 실패: ${error.code}`);
      if (!data) throw new Error("NOT_FOUND");
      return Response.json({ success: true });
    }

    if (input.action === "add-blocked-phone") {
      const values = blockedPhoneSchema.parse(input);
      const phone = assertValidKoreanPhone(values.phone);
      const { data, error } = await admin.from("course_document_blocked_phones").insert({
        workspace_id: membership.workspace_id, phone_normalized: phone, memo: values.memo, created_by: user.id,
      }).select("id,phone_normalized,memo,created_at").single();
      if (error?.code === "23505") throw new Error("이미 차단된 전화번호입니다.");
      if (error) throw new Error(`차단 전화번호 저장 실패: ${error.code}`);
      return Response.json({ blockedPhone: { id: data.id, phone: data.phone_normalized, memo: data.memo, createdAt: data.created_at } }, { status: 201 });
    }

    const { data, error } = await admin.from("course_document_blocked_phones").delete().eq("id", input.id).eq("workspace_id", membership.workspace_id).select("id").maybeSingle();
    if (error) throw new Error(`차단 전화번호 삭제 실패: ${error.code}`);
    if (!data) throw new Error("NOT_FOUND");
    return Response.json({ success: true });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
