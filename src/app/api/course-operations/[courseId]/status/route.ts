import {
  courseOperationsApiError,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import {
  COURSE_STATUS_LABELS,
  isCourseStatus,
} from "@/lib/course-operations/course-status";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
      request.json() as Promise<{ status?: unknown }>,
    ]);
    if (!isCourseStatus(body.status)) {
      return Response.json(
        { message: "강의 상태가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id,name,status")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
    if (!course) throw new Error("NOT_FOUND");

    const { error: updateError } = await admin
      .from("courses")
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id);
    if (updateError) throw new Error(`강의 상태 저장 실패: ${updateError.code}`);

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.course_status_changed",
      entity_type: "course",
      entity_id: courseId,
      metadata: {
        name: course.name,
        previous_status: course.status,
        status: body.status,
      },
    });
    invalidateCourseOperationsList();

    return Response.json({
      id: courseId,
      status: body.status,
      statusLabel: COURSE_STATUS_LABELS[body.status],
    });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
