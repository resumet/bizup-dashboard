import { randomBytes } from "node:crypto";

import { hasAdminAccess } from "@/lib/admin/access";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { prepareCourseDocumentImage } from "@/lib/course-documents/image";
import { COURSE_DOCUMENT_IMAGE_BUCKET, courseDocumentErrorResponse } from "@/lib/course-documents/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(await createClient());
    if (!user) throw new Error("UNAUTHORIZED");
    const membership = await requireCourseOperationsMembership(user.id);
    if (!hasAdminAccess(user.email, membership.role)) throw new Error("FORBIDDEN");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("이미지 파일을 선택해 주세요.");
    const image = await prepareCourseDocumentImage(file);
    const admin = createAdminClient();
    const path = `${membership.workspace_id}/contracts/${Date.now()}-${randomBytes(8).toString("hex")}.${image.extension}`;
    const { error } = await admin.storage
      .from(COURSE_DOCUMENT_IMAGE_BUCKET)
      .upload(path, image.buffer, { contentType: image.contentType, upsert: false });
    if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
    const { data } = admin.storage.from(COURSE_DOCUMENT_IMAGE_BUCKET).getPublicUrl(path);
    return Response.json({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
