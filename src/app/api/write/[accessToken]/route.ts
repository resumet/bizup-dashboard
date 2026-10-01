import { z } from "zod";

import { createUniqueDocumentSlug, courseDocumentErrorResponse, getExternalCourse, toDocumentDetail, toDocumentSummary } from "@/lib/course-documents/server";
import { courseDocumentMaterialPositionSchema } from "@/lib/course-documents/materials";
import { saveCourseDocumentSchema } from "@/lib/course-documents/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ accessToken: string }> };
const documentIdSchema = z.uuid();
const startMaterialSchema = z.object({
  action: z.literal("start-material"),
  position: courseDocumentMaterialPositionSchema,
});

export async function GET(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, course } = await getExternalCourse(accessToken);
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (documentId) {
      const id = documentIdSchema.parse(documentId);
      const { data: material, error: materialError } = await admin.from("course_instagram_materials").select("position").eq("course_id", course.id).eq("document_id", id).maybeSingle();
      if (materialError) throw new Error(`인스타 자료 조회 실패: ${materialError.code}`);
      if (!material) throw new Error("NOT_FOUND");
      const { data, error } = await admin.from("course_documents").select("id,course_id,instructor_name,title,slug,content,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at").eq("id", id).eq("course_id", course.id).is("deleted_at", null).maybeSingle();
      if (error) throw new Error(`문서 조회 실패: ${error.code}`);
      if (!data) throw new Error("NOT_FOUND");
      return Response.json({ course, document: toDocumentDetail(data) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [materialsResult, documentsResult] = await Promise.all([
      admin.from("course_instagram_materials").select("position,title,document_id").eq("course_id", course.id).order("position"),
      admin.from("course_documents").select("id,course_id,instructor_name,title,slug,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at").eq("course_id", course.id).is("deleted_at", null),
    ]);
    const queryError = materialsResult.error ?? documentsResult.error;
    if (queryError) throw new Error(`인스타 자료 목록 조회 실패: ${queryError.code}`);
    return Response.json({
      course,
      materials: materialsResult.data ?? [],
      documents: (documentsResult.data ?? []).map((row) => toDocumentSummary(row)),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, course } = await getExternalCourse(accessToken);
    const input = startMaterialSchema.parse(await request.json());
    const { data: material, error: materialError } = await admin
      .from("course_instagram_materials")
      .select("title,document_id")
      .eq("course_id", course.id)
      .eq("position", input.position)
      .maybeSingle();
    if (materialError) throw new Error(`인스타 자료 조회 실패: ${materialError.code}`);
    if (!material?.title.trim()) throw new Error("작성할 인스타 자료 제목이 없습니다.");
    const slug = await createUniqueDocumentSlug(material.title);
    const { data, error } = await admin.rpc("start_instagram_material_document", {
      p_course_id: course.id,
      p_position: input.position,
      p_slug: slug,
    });
    if (error) throw new Error(`문서 생성 실패: ${error.code}`);
    if (typeof data !== "string") throw new Error("생성된 문서를 확인하지 못했습니다.");
    return Response.json({ id: data }, { status: material.document_id ? 200 : 201 });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, course } = await getExternalCourse(accessToken);
    const body = await request.json() as Record<string, unknown>;
    const documentId = documentIdSchema.parse(body.documentId);
    const input = saveCourseDocumentSchema.parse(body);
    const [existingResult, materialResult] = await Promise.all([
      admin.from("course_documents").select("id,lead_gate_enabled,lead_gate_after_block_id").eq("id", documentId).eq("course_id", course.id).is("deleted_at", null).maybeSingle(),
      admin.from("course_instagram_materials").select("title").eq("course_id", course.id).eq("document_id", documentId).maybeSingle(),
    ]);
    const queryError = existingResult.error ?? materialResult.error;
    if (queryError) throw new Error(`인스타 자료 조회 실패: ${queryError.code}`);
    const existing = existingResult.data;
    const material = materialResult.data;
    if (!existing || !material?.title.trim()) throw new Error("NOT_FOUND");
    const gateIndex = input.content.findIndex((block) => block.id === existing.lead_gate_after_block_id);
    const keepLeadGate = existing.lead_gate_enabled && gateIndex >= 0 && gateIndex < input.content.length - 1;
    const { data, error } = await admin.from("course_documents").update({
      title: material.title,
      content: input.content,
      status: "draft",
      published_at: null,
      lead_gate_enabled: keepLeadGate,
      lead_gate_after_block_id: keepLeadGate ? existing.lead_gate_after_block_id : null,
    }).eq("id", documentId).eq("course_id", course.id).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw new Error(`문서 저장 실패: ${error.code}`);
    if (!data) throw new Error("NOT_FOUND");
    return Response.json({ success: true });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
