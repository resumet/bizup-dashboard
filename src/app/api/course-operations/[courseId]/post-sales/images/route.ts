import { randomUUID } from "node:crypto";
import { salesContext } from "@/lib/post-sales/server";
import { prepareCourseDocumentImage } from "@/lib/course-documents/image";
import { COURSE_DOCUMENT_IMAGE_BUCKET, courseDocumentErrorResponse } from "@/lib/course-documents/server";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const ctx = await salesContext((await params).courseId);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 선택해 주세요.");
    const image = await prepareCourseDocumentImage(file);
    const path = `${ctx.workspaceId}/${ctx.course.id}/post-sales/${randomUUID()}.${image.extension}`;
    const bucket = ctx.admin.storage.from(COURSE_DOCUMENT_IMAGE_BUCKET);
    const { error } = await bucket.upload(path, image.buffer, { contentType: image.contentType, upsert: false });
    if (error) throw new Error("이미지를 업로드하지 못했습니다.");
    return Response.json({ url: bucket.getPublicUrl(path).data.publicUrl }, { status: 201 });
  } catch (error) { return courseDocumentErrorResponse(error); }
}
