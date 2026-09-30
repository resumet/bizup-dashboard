import { randomBytes } from "node:crypto";

import { COURSE_DOCUMENT_IMAGE_BUCKET, courseDocumentErrorResponse, getExternalCourse } from "@/lib/course-documents/server";
import { prepareCourseDocumentImage } from "@/lib/course-documents/image";

export const runtime = "nodejs";
type Context = { params: Promise<{ accessToken: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const { accessToken } = await params;
    const { admin, settings, course } = await getExternalCourse(accessToken);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 선택해 주세요.");
    const image = await prepareCourseDocumentImage(file);
    const path = `${settings.workspace_id}/${course.id}/${Date.now()}-${randomBytes(8).toString("hex")}.${image.extension}`;
    const { error } = await admin.storage.from(COURSE_DOCUMENT_IMAGE_BUCKET).upload(path, image.buffer, { contentType: image.contentType, upsert: false });
    if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
    const { data } = admin.storage.from(COURSE_DOCUMENT_IMAGE_BUCKET).getPublicUrl(path);
    return Response.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
