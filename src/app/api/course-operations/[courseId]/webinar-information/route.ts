import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";
import {
  courseOperationsApiError,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseWebinarInformation } from "@/lib/webinar-information/model";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const supabase = await createClient();
  try {
    const user = await requireCourseOperationsUser(supabase);
    const [{ courseId }, membership, body] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json(),
    ]);
    const information = parseWebinarInformation(body);
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id,name")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
    if (!course) throw new Error("NOT_FOUND");

    const { error } = await admin
      .from("courses")
      .update({
        course_canva_link: information.courseMaterialsLink,
        webinar_opening_video_url: information.openingVideoUrl,
        webinar_youtube_title: information.youtubeTitle,
        webinar_youtube_description: information.youtubeDescription,
        webinar_command_deck_url: information.commandDeckUrl,
        webinar_banner_storage_url: information.bannerStorageUrl,
        webinar_youtube_live_url: information.youtubeLiveUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id);
    if (error) throw new Error(`웨비나 정보 저장 실패: ${error.code}`);

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.webinar_information_saved",
      entity_type: "course",
      entity_id: courseId,
      metadata: { name: course.name },
    });
    invalidateCourseOperationsList();
    return Response.json({ information });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
