import "server-only";
import { z } from "zod";
import { getExternalCourse, requireCourseDocumentMember } from "./server";

export async function requirePdfDocument(documentId: string, accessToken?: string | null) {
  z.uuid().parse(documentId);
  if (accessToken) {
    const { admin, course, settings } = await getExternalCourse(accessToken);
    const [doc, material] = await Promise.all([
      admin.from("course_documents").select("id,course_id,workspace_id").eq("id", documentId).eq("course_id", course.id).is("deleted_at", null).maybeSingle(),
      admin.from("course_instagram_materials").select("position").eq("document_id", documentId).eq("course_id", course.id).maybeSingle(),
    ]);
    if (doc.error || material.error) throw new Error("문서 권한을 확인하지 못했습니다.");
    if (!doc.data || !material.data || doc.data.workspace_id !== settings.workspace_id) throw new Error("NOT_FOUND");
    return { admin, document: doc.data };
  }
  const { admin, membership } = await requireCourseDocumentMember();
  const { data, error } = await admin.from("course_documents").select("id,course_id,workspace_id")
    .eq("id", documentId).eq("workspace_id", membership.workspace_id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("문서 권한을 확인하지 못했습니다.");
  if (!data) throw new Error("NOT_FOUND");
  return { admin, document: data };
}
