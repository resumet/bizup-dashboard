import { randomBytes } from "node:crypto";
import { z } from "zod";

import { COURSE_DOCUMENT_IMAGE_BUCKET, courseDocumentErrorResponse, requireCourseDocumentMember } from "@/lib/course-documents/server";
import { prepareCourseDocumentImage } from "@/lib/course-documents/image";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { membership, admin } = await requireCourseDocumentMember();
    const formData = await request.formData();
    const courseId = z.uuid().parse(formData.get("courseId"));
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 선택해 주세요.");
    const image = await prepareCourseDocumentImage(file);
    const { data: course } = await admin.from("courses").select("id").eq("id", courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
    if (!course) throw new Error("NOT_FOUND");
    const path = `${membership.workspace_id}/${courseId}/${Date.now()}-${randomBytes(8).toString("hex")}.${image.extension}`;
    const { error } = await admin.storage.from(COURSE_DOCUMENT_IMAGE_BUCKET).upload(path, image.buffer, { contentType: image.contentType, upsert: false });
    if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
    const { data } = admin.storage.from(COURSE_DOCUMENT_IMAGE_BUCKET).getPublicUrl(path);
    return Response.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
