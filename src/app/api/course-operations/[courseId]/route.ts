import {
  assertLinkableItems,
  courseOperationsApiError,
  replaceCourseChildren,
  replaceCourseLinks,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { parseCourseOperationsInput } from "@/lib/course-operations/validation";
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
      request.json(),
    ]);
    const input = parseCourseOperationsInput(body);
    const admin = createAdminClient();
    const { data: course } = await admin
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (!course) throw new Error("NOT_FOUND");

    await assertLinkableItems(membership.workspace_id, input, courseId);
    await replaceCourseChildren(courseId, input);

    const { error } = await admin
      .from("courses")
      .update({
        name: input.name,
        instructor_name: input.instructorName,
        free_webinar_at: input.freeWebinarAt,
        starts_at: input.startsAt,
        early_bird_event: input.earlyBirdEvent,
        first_50_event: input.first50Event,
        free_kakao_room_1_link: input.freeKakaoRoom1Link,
        free_kakao_room_2_link: input.freeKakaoRoom2Link,
        communication_room_link: input.communicationRoomLink,
        payment_link: input.paymentLink,
        inquiry_link: input.inquiryLink,
        curriculum_link: input.curriculumLink,
        free_gift_link: input.freeGiftLink,
        course_viewing_link: input.courseViewingLink,
        free_address_book_id: input.freeAddressBookId || null,
        required_tasks: input.requiredTasks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id);
    if (error) throw new Error(`강의 저장 실패: ${error.code}`);

    await replaceCourseLinks(membership.workspace_id, courseId, input);
    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.course_saved",
      entity_type: "course",
      entity_id: courseId,
      metadata: { name: input.name },
    });
    return Response.json({ id: courseId });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}

export async function DELETE(
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
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id,name")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
    if (!course) throw new Error("NOT_FOUND");

    const { error: deleteError } = await admin
      .from("courses")
      .delete()
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id);
    if (deleteError) throw new Error(`강의 삭제 실패: ${deleteError.code}`);

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.course_deleted",
      entity_type: "course",
      entity_id: courseId,
      metadata: { name: course.name },
    });
    return Response.json({ message: "강의가 삭제되었습니다." });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
