import { z } from "zod";

import { createUniqueDocumentSlug, courseDocumentErrorResponse, getExternalCourse, toDocumentDetail, toDocumentSummary } from "@/lib/course-documents/server";
import { saveCourseDocumentSchema } from "@/lib/course-documents/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ accessToken: string }> };
const documentIdSchema = z.uuid();

export async function GET(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, course } = await getExternalCourse(accessToken);
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (documentId) {
      const id = documentIdSchema.parse(documentId);
      const { data, error } = await admin.from("course_documents").select("id,course_id,instructor_name,title,slug,content,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at").eq("id", id).eq("course_id", course.id).is("deleted_at", null).maybeSingle();
      if (error) throw new Error(`문서 조회 실패: ${error.code}`);
      if (!data) throw new Error("NOT_FOUND");
      return Response.json({ course, document: toDocumentDetail(data) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { data, error } = await admin.from("course_documents").select("id,course_id,instructor_name,title,slug,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at").eq("course_id", course.id).is("deleted_at", null).order("updated_at", { ascending: false });
    if (error) throw new Error(`문서 목록 조회 실패: ${error.code}`);
    return Response.json({ course, documents: (data ?? []).map((row) => toDocumentSummary(row)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, settings, course } = await getExternalCourse(accessToken);
    const input = saveCourseDocumentSchema.parse(await request.json());
    const slug = await createUniqueDocumentSlug(input.title);
    const { data, error } = await admin.from("course_documents").insert({
      workspace_id: settings.workspace_id,
      course_id: course.id,
      instructor_name: course.instructor_name,
      title: input.title,
      content: input.content,
      slug,
    }).select("id").single();
    if (error) throw new Error(`문서 생성 실패: ${error.code}`);
    return Response.json({ id: data.id }, { status: 201 });
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
    const { data: existing } = await admin.from("course_documents").select("id,lead_gate_enabled,lead_gate_after_block_id").eq("id", documentId).eq("course_id", course.id).is("deleted_at", null).maybeSingle();
    if (!existing) throw new Error("NOT_FOUND");
    const gateIndex = input.content.findIndex((block) => block.id === existing.lead_gate_after_block_id);
    const keepLeadGate = existing.lead_gate_enabled && gateIndex >= 0 && gateIndex < input.content.length - 1;
    const { data, error } = await admin.from("course_documents").update({
      title: input.title,
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

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, course } = await getExternalCourse(accessToken);
    const documentId = documentIdSchema.parse((await request.json() as { documentId?: unknown }).documentId);
    const { data, error } = await admin.from("course_documents").update({ deleted_at: new Date().toISOString(), status: "draft", published_at: null, lead_gate_enabled: false, lead_gate_after_block_id: null }).eq("id", documentId).eq("course_id", course.id).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw new Error(`문서 삭제 실패: ${error.code}`);
    if (!data) throw new Error("NOT_FOUND");
    return Response.json({ success: true });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
