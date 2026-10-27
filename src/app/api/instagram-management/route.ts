import { randomBytes } from "node:crypto";
import { z } from "zod";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";

import { courseDocumentErrorResponse, requireCourseDocumentMember, toDocumentSummary } from "@/lib/course-documents/server";
import {
  COURSE_DOCUMENT_MATERIAL_LIMIT,
  courseDocumentDmMaterialSchema,
  courseDocumentDmMaterialUrlSchema,
  courseDocumentInstagramUrlSchema,
  courseDocumentMaterialDateSchema,
  courseDocumentMaterialDescriptionSchema,
  courseDocumentMaterialPositionSchema,
  courseDocumentPlanningSheetUrlSchema,
  courseDocumentReferencePlanningNumberSchema,
  courseDocumentMaterials,
  courseDocumentMaterialTitleSchema,
} from "@/lib/course-documents/materials";
import type { BlockedPhone, CourseDocumentCourse, CourseDocumentLead, CourseDocumentMaterial } from "@/lib/course-documents/types";
import { adminCourseDocumentSchema, assertValidKoreanPhone, blockedPhoneSchema } from "@/lib/course-documents/validation";

export const runtime = "nodejs";

const materialInputSchema = z.object({
  position: courseDocumentMaterialPositionSchema,
  title: courseDocumentMaterialTitleSchema,
  referencePlanningNumber: courseDocumentReferencePlanningNumberSchema,
  planningCompleted: z.boolean(),
  filmingDate: courseDocumentMaterialDateSchema,
  filmingCompleted: z.boolean(),
  editingCompleted: z.boolean(),
  uploadCompleted: z.boolean(),
  uploadedUrl: courseDocumentInstagramUrlSchema,
  dmMaterial: courseDocumentDmMaterialSchema,
  dmNotRequired: z.boolean(),
  dmMaterialDescription: courseDocumentMaterialDescriptionSchema,
  additionalDescription: courseDocumentMaterialDescriptionSchema,
}).superRefine((material, context) => {
  if (material.filmingCompleted && !material.planningCompleted) {
    context.addIssue({ code: "custom", message: "촬영 완료 항목은 기획 완료 상태여야 합니다." });
  }
  if (material.uploadCompleted && !material.filmingCompleted) {
    context.addIssue({ code: "custom", message: "업로드 완료 항목은 촬영 완료 상태여야 합니다." });
  }
  if (material.uploadCompleted && !material.editingCompleted) {
    context.addIssue({ code: "custom", message: "업로드 완료 항목은 편집 완료 상태여야 합니다." });
  }
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update-course-access"), courseId: z.uuid(), enabled: z.boolean(), regenerateToken: z.boolean().optional().default(false) }),
  z.object({
    action: z.literal("save-instagram-settings"),
    courseId: z.uuid(),
    accountUrl: courseDocumentInstagramUrlSchema,
    totalCount: z.number().int().min(0).max(COURSE_DOCUMENT_MATERIAL_LIMIT),
    planningCompletedCount: z.number().int().min(0).max(COURSE_DOCUMENT_MATERIAL_LIMIT),
    filmingCompletedCount: z.number().int().min(0).max(COURSE_DOCUMENT_MATERIAL_LIMIT),
  }).refine((value) => value.filmingCompletedCount <= value.planningCompletedCount, {
    message: "촬영 완료 건수는 기획 완료 건수보다 많을 수 없습니다.",
  }).refine((value) => value.planningCompletedCount <= value.totalCount, {
    message: "완료 건수는 전체 진행 건수보다 많을 수 없습니다.",
  }),
  z.object({
    action: z.literal("save-materials"),
    courseId: z.uuid(),
    materials: z.array(materialInputSchema).min(1).max(COURSE_DOCUMENT_MATERIAL_LIMIT),
  }),
  z.object({
    action: z.literal("save-material-titles"),
    courseId: z.uuid(),
    titles: z.array(courseDocumentMaterialTitleSchema).min(1).max(COURSE_DOCUMENT_MATERIAL_LIMIT),
  }),
  z.object({
    action: z.literal("bulk-update-filming-date"),
    courseId: z.uuid(),
    positions: z.array(courseDocumentMaterialPositionSchema).min(1).max(COURSE_DOCUMENT_MATERIAL_LIMIT)
      .refine((positions) => new Set(positions).size === positions.length, "중복된 인스타 자료 번호가 있습니다."),
    filmingDate: courseDocumentMaterialDateSchema,
  }),
  z.object({
    action: z.literal("save-upload-links"),
    courseId: z.uuid(),
    position: courseDocumentMaterialPositionSchema,
    uploadedUrl: courseDocumentInstagramUrlSchema,
    dmMaterial: courseDocumentDmMaterialUrlSchema,
    dmNotRequired: z.boolean(),
  }),
  z.object({ action: z.literal("save-planning-sheet"), courseId: z.uuid(), url: courseDocumentPlanningSheetUrlSchema }),
  z.object({ action: z.literal("save-document"), documentId: z.uuid(), document: adminCourseDocumentSchema }),
  z.object({ action: z.literal("delete-document"), documentId: z.uuid() }),
  z.object({ action: z.literal("add-blocked-phone"), phone: z.string(), memo: z.string().optional() }),
  z.object({ action: z.literal("delete-blocked-phone"), id: z.uuid() }),
]);

function toMaterial(row: {
  position: number;
  title: string;
  reference_planning_number: string;
  document_id: string | null;
  planning_completed: boolean;
  filming_date: string | null;
  filming_completed: boolean;
  editing_completed: boolean;
  upload_date: string | null;
  upload_completed: boolean;
  uploaded_url: string;
  dm_material: string;
  dm_not_required: boolean;
  dm_material_description: string;
  additional_description: string;
}): CourseDocumentMaterial {
  return {
    position: row.position,
    title: row.title,
    referencePlanningNumber: row.reference_planning_number,
    documentId: row.document_id,
    planningCompleted: row.planning_completed,
    filmingDate: row.filming_date ?? "",
    filmingCompleted: row.filming_completed,
    editingCompleted: row.editing_completed,
    uploadDate: row.upload_date ?? "",
    uploadCompleted: row.upload_completed,
    uploadedUrl: row.uploaded_url,
    dmMaterial: row.dm_material,
    dmNotRequired: row.dm_not_required,
    dmMaterialDescription: row.dm_material_description,
    additionalDescription: row.additional_description,
  };
}

export async function GET(request: Request) {
  try {
    const { membership, admin } = await requireCourseDocumentMember();
    const query = new URL(request.url).searchParams;
    const courseId = query.get("courseId");
    if (courseId) z.uuid().parse(courseId);
    const includeLeads = !courseId && query.get("view") !== "list";
    let courseQuery = admin
      .from("courses")
      .select("id,name,status,instructor_name,cohort,free_webinar_at")
      .eq("workspace_id", membership.workspace_id)
      .order("free_webinar_at", { ascending: false });
    if (courseId) courseQuery = courseQuery.eq("id", courseId);
    const { data: courses, error: coursesError } = await courseQuery;
    if (courseId && !coursesError && !courses?.length) throw new Error("NOT_FOUND");
    if (coursesError) throw new Error(`강의 조회 실패: ${coursesError.code}`);

    const { data: existingSettings, error: settingsError } = await admin
      .from("course_document_settings")
      .select("course_id,external_edit_enabled,external_access_token,planning_sheet_url,instagram_account_url,instagram_total_count")
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

    const courseIds = (courses ?? []).map((course) => course.id);
    const materialCourseIds = courseIds.length ? courseIds : ["00000000-0000-0000-0000-000000000000"];
    const [settingsResult, documentsResult, materialsResult, leadsResult, blockedResult] = await Promise.all([
      admin.from("course_document_settings").select("course_id,external_edit_enabled,external_access_token,planning_sheet_url,instagram_account_url,instagram_total_count").eq("workspace_id", membership.workspace_id),
      admin.from("course_documents").select("id,course_id,instructor_name,title,slug,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at,course_document_leads(count)").eq("workspace_id", membership.workspace_id).in("course_id", materialCourseIds).is("deleted_at", null).order("updated_at", { ascending: false }),
      admin.from("course_instagram_materials").select("course_id,position,title,reference_planning_number,document_id,planning_completed,filming_date,filming_completed,editing_completed,upload_date,upload_completed,uploaded_url,dm_material,dm_not_required,dm_material_description,additional_description").in("course_id", materialCourseIds).order("position"),
      includeLeads ? admin.from("course_document_leads").select("id,document_id,course_id,instructor_name,name,phone,utm_source,utm_medium,utm_campaign,utm_content,referrer,created_at,course_documents!inner(title),courses!inner(name)").eq("workspace_id", membership.workspace_id).order("created_at", { ascending: false }).limit(10_000) : Promise.resolve({ data: [], error: null }),
      !courseId ? admin.from("course_document_blocked_phones").select("id,phone_normalized,memo,created_at").eq("workspace_id", membership.workspace_id).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    const queryError = settingsResult.error ?? documentsResult.error ?? materialsResult.error ?? leadsResult.error ?? blockedResult.error;
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
    const savedMaterialsByCourse = new Map<string, CourseDocumentMaterial[]>();
    for (const material of materialsResult.data ?? []) {
      const saved = savedMaterialsByCourse.get(material.course_id) ?? [];
      saved.push(toMaterial(material));
      savedMaterialsByCourse.set(material.course_id, saved);
    }
    const settingsByCourse = new Map((settingsResult.data ?? []).map((item) => [item.course_id, item] as const));
    const courseItems: CourseDocumentCourse[] = (courses ?? []).map((course) => {
      const setting = settingsByCourse.get(course.id);
      return {
        id: course.id,
        name: course.name,
        instructorName: course.instructor_name,
        status: course.status,
        cohort: course.cohort ?? "",
        freeWebinarAt: course.free_webinar_at,
        externalEditEnabled: setting?.external_edit_enabled ?? false,
        externalAccessToken: setting?.external_access_token ?? "",
        planningSheetUrl: setting?.planning_sheet_url ?? "",
        instagramAccountUrl: setting?.instagram_account_url ?? "",
        instagramTotalCount: setting?.instagram_total_count ?? 0,
        materials: courseDocumentMaterials(
          savedMaterialsByCourse.get(course.id) ?? [],
          setting?.instagram_total_count ?? 0,
        ),
        documents: documents.filter((document) => document.courseId === course.id),
      };
    });
    const blockedPhones: BlockedPhone[] = (blockedResult.data ?? []).map((row) => ({
      id: row.id,
      phone: row.phone_normalized,
      memo: row.memo,
      createdAt: row.created_at,
    }));
    return Response.json({ courses: sortByNearestWebinar(courseItems), leads, blockedPhones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, membership, admin } = await requireCourseDocumentMember();
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

    if (input.action === "save-instagram-settings") {
      const { error: resizeError } = await admin.rpc("resize_instagram_progress", {
        p_course_id: input.courseId,
        p_workspace_id: membership.workspace_id,
        p_account_url: input.accountUrl,
        p_total_count: input.totalCount,
        p_planning_completed_count: input.planningCompletedCount,
        p_filming_completed_count: input.filmingCompletedCount,
      });
      if (resizeError?.message.includes("INSTAGRAM_TOTAL_COUNT_HAS_DATA")) {
        throw new Error("줄이려는 범위에 저장된 자료가 있습니다. 해당 항목을 비운 뒤 전체 진행 건수를 줄여 주세요.");
      }
      if (resizeError?.message.includes("INSTAGRAM_FILMING_COUNT_BELOW_UPLOADS")) {
        throw new Error("촬영 완료 건수는 업로드 완료 건수보다 적게 설정할 수 없습니다.");
      }
      if (resizeError) throw new Error(`인스타그램 진행 설정 저장 실패: ${resizeError.code}`);

      const { error: scheduleError } = await admin.rpc("refresh_instagram_upload_schedule", {
        p_course_id: input.courseId,
      });
      if (scheduleError) throw new Error(`인스타그램 업로드 일정 생성 실패: ${scheduleError.code}`);

      const [settingsResult, materialsResult] = await Promise.all([
        admin.from("course_document_settings")
          .select("instagram_account_url,instagram_total_count")
          .eq("course_id", input.courseId)
          .eq("workspace_id", membership.workspace_id)
          .single(),
        admin.from("course_instagram_materials")
          .select("position,title,reference_planning_number,document_id,planning_completed,filming_date,filming_completed,editing_completed,upload_date,upload_completed,uploaded_url,dm_material,dm_not_required,dm_material_description,additional_description")
          .eq("course_id", input.courseId)
          .order("position"),
      ]);
      const resultError = settingsResult.error ?? materialsResult.error;
      if (resultError) throw new Error(`저장된 인스타그램 진행 설정 조회 실패: ${resultError.code}`);
      if (!settingsResult.data) throw new Error("저장된 인스타그램 진행 설정을 찾지 못했습니다.");
      return Response.json({
        instagramSettings: {
          accountUrl: settingsResult.data.instagram_account_url,
          totalCount: settingsResult.data.instagram_total_count,
        },
        materials: (materialsResult.data ?? []).map(toMaterial),
      });
    }

    if (input.action === "save-planning-sheet") {
      const { data: course } = await admin
        .from("courses")
        .select("id")
        .eq("id", input.courseId)
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle();
      if (!course) throw new Error("NOT_FOUND");

      const { data, error } = await admin
        .from("course_document_settings")
        .upsert({
          course_id: course.id,
          workspace_id: membership.workspace_id,
          planning_sheet_url: input.url,
        }, { onConflict: "course_id" })
        .select("planning_sheet_url")
        .single();
      if (error) throw new Error(`기획시트 URL 저장 실패: ${error.code}`);
      return Response.json({ planningSheetUrl: data.planning_sheet_url });
    }

    if (input.action === "save-material-titles") {
      const { data: course } = await admin
        .from("courses")
        .select("id")
        .eq("id", input.courseId)
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle();
      if (!course) throw new Error("NOT_FOUND");

      const { data: setting, error: settingError } = await admin
        .from("course_document_settings")
        .select("instagram_total_count")
        .eq("course_id", course.id)
        .eq("workspace_id", membership.workspace_id)
        .single();
      if (settingError) throw new Error(`인스타 자료 설정 조회 실패: ${settingError.code}`);
      if (input.titles.length > setting.instagram_total_count) {
        throw new Error(`제목은 전체 진행 건수 ${setting.instagram_total_count}개까지만 입력할 수 있습니다.`);
      }

      const positions = input.titles.map((_, index) => index + 1);
      const { data: linkedMaterials, error: linkedError } = await admin
        .from("course_instagram_materials")
        .select("position,document_id")
        .eq("course_id", course.id)
        .in("position", positions);
      if (linkedError) throw new Error(`인스타 자료 확인 실패: ${linkedError.code}`);
      const linkedPositions = new Set((linkedMaterials ?? []).filter((material) => material.document_id).map((material) => material.position));
      if (input.titles.some((title, index) => linkedPositions.has(index + 1) && !title)) {
        throw new Error("강사가 작성한 글이 있는 항목의 제목은 비워둘 수 없습니다.");
      }

      const { data, error } = await admin
        .from("course_instagram_materials")
        .upsert(input.titles.map((title, index) => ({
          course_id: course.id,
          position: index + 1,
          title,
          updated_at: new Date().toISOString(),
        })), { onConflict: "course_id,position" })
        .select("position,title,reference_planning_number,document_id,planning_completed,filming_date,filming_completed,editing_completed,upload_date,upload_completed,uploaded_url,dm_material,dm_not_required,dm_material_description,additional_description")
        .order("position");
      if (error) throw new Error(`인스타 제목 일괄 저장 실패: ${error.code}`);
      return Response.json({ materials: (data ?? []).map(toMaterial) });
    }

    if (input.action === "save-upload-links") {
      const { data: course } = await admin
        .from("courses")
        .select("id")
        .eq("id", input.courseId)
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle();
      if (!course) throw new Error("NOT_FOUND");

      const { data, error } = await admin
        .from("course_instagram_materials")
        .update({
          uploaded_url: input.uploadedUrl,
          dm_material: input.dmMaterial,
          dm_not_required: input.dmNotRequired,
          updated_at: new Date().toISOString(),
        })
        .eq("course_id", course.id)
        .eq("position", input.position)
        .select("position,title,reference_planning_number,document_id,planning_completed,filming_date,filming_completed,editing_completed,upload_date,upload_completed,uploaded_url,dm_material,dm_not_required,dm_material_description,additional_description")
        .single();
      if (error?.code === "PGRST116") throw new Error("NOT_FOUND");
      if (error) throw new Error(`인스타 업로드 링크 저장 실패: ${error.code}`);
      return Response.json({ material: toMaterial(data) });
    }

    if (input.action === "bulk-update-filming-date") {
      const { data: course } = await admin
        .from("courses")
        .select("id")
        .eq("id", input.courseId)
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle();
      if (!course) throw new Error("NOT_FOUND");

      const { data: targetMaterials, error: targetError } = await admin
        .from("course_instagram_materials")
        .select("position,upload_completed")
        .eq("course_id", course.id)
        .in("position", input.positions);
      if (targetError) throw new Error(`인스타 자료 확인 실패: ${targetError.code}`);
      if ((targetMaterials ?? []).length !== input.positions.length) throw new Error("선택한 인스타 자료를 찾을 수 없습니다.");
      if ((targetMaterials ?? []).some((material) => material.upload_completed)) {
        throw new Error("업로드 완료 항목의 촬영 일정은 일괄 변경할 수 없습니다.");
      }

      const { data, error } = await admin
        .from("course_instagram_materials")
        .update({
          filming_date: input.filmingDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("course_id", course.id)
        .eq("upload_completed", false)
        .in("position", input.positions)
        .select("position,title,reference_planning_number,document_id,planning_completed,filming_date,filming_completed,editing_completed,upload_date,upload_completed,uploaded_url,dm_material,dm_not_required,dm_material_description,additional_description")
        .order("position");
      if (error) throw new Error(`촬영 일정 일괄 저장 실패: ${error.code}`);
      if ((data ?? []).length !== input.positions.length) throw new Error("변경된 촬영 일정을 모두 확인하지 못했습니다.");
      return Response.json({ materials: (data ?? []).map(toMaterial) });
    }

    if (input.action === "save-materials") {
      const { data: course } = await admin
        .from("courses")
        .select("id")
        .eq("id", input.courseId)
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle();
      if (!course) throw new Error("NOT_FOUND");

      const positions = input.materials.map((material) => material.position);
      if (new Set(positions).size !== positions.length) {
        throw new Error("중복된 인스타 자료 번호가 있습니다.");
      }

      const { data: existingMaterials, error: existingMaterialError } = await admin
        .from("course_instagram_materials")
        .select("position,document_id")
        .eq("course_id", course.id)
        .in("position", positions);
      if (existingMaterialError) throw new Error(`인스타 자료 확인 실패: ${existingMaterialError.code}`);
      const linkedPositions = new Set((existingMaterials ?? []).filter((material) => material.document_id).map((material) => material.position));
      if (input.materials.some((material) => linkedPositions.has(material.position) && !material.title)) {
        throw new Error("강사가 작성한 글이 있는 항목의 제목은 비워둘 수 없습니다.");
      }

      const { data, error } = await admin
        .from("course_instagram_materials")
        .upsert(input.materials.map((material) => ({
          course_id: course.id,
          position: material.position,
          title: material.title,
          reference_planning_number: material.referencePlanningNumber,
          planning_completed: material.planningCompleted,
          filming_date: material.filmingDate || null,
          filming_completed: material.filmingCompleted,
          editing_completed: material.editingCompleted,
          upload_completed: material.uploadCompleted,
          uploaded_url: material.uploadedUrl,
          dm_material: material.dmMaterial,
          dm_not_required: material.dmNotRequired,
          dm_material_description: material.dmMaterialDescription,
          additional_description: material.additionalDescription,
          updated_at: new Date().toISOString(),
        })), { onConflict: "course_id,position" })
        .select("position,title,reference_planning_number,document_id,planning_completed,filming_date,filming_completed,editing_completed,upload_date,upload_completed,uploaded_url,dm_material,dm_not_required,dm_material_description,additional_description")
        .order("position");
      if (error?.code === "23505") throw new Error("이 글은 이미 다른 인스타 자료에 연결되어 있습니다.");
      if (error) throw new Error(`인스타 자료 저장 실패: ${error.code}`);
      return Response.json({
        materials: (data ?? []).map(toMaterial),
      });
    }

    if (input.action === "save-document") {
      const { data: existing } = await admin.from("course_documents").select("id,course_id,status").eq("id", input.documentId).eq("workspace_id", membership.workspace_id).is("deleted_at", null).maybeSingle();
      if (!existing) throw new Error("NOT_FOUND");
      const { data: material, error: materialError } = await admin
        .from("course_instagram_materials")
        .select("title")
        .eq("course_id", existing.course_id)
        .eq("document_id", input.documentId)
        .maybeSingle();
      if (materialError) throw new Error(`인스타 자료 확인 실패: ${materialError.code}`);
      const document = input.document;
      const values: Record<string, unknown> = {
        title: material?.title ?? document.title,
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
