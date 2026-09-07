import { COURSE_BANNER_BUCKET } from "@/lib/course-operations/banner";
import {
  courseOperationsApiError,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const supabase = await createClient();
  try {
    const user = await requireCourseOperationsUser(supabase);
    const [{ courseId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .select("banner_image_path")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (error) throw new Error(`강의 조회 실패: ${error.code}`);
    if (!course?.banner_image_path) throw new Error("NOT_FOUND");

    const { data, error: downloadError } = await admin.storage
      .from(COURSE_BANNER_BUCKET)
      .download(course.banner_image_path);
    if (downloadError || !data) throw new Error("배너 이미지를 찾을 수 없습니다.");

    return new Response(await data.arrayBuffer(), {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": data.type || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
