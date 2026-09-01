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

export async function POST(request: Request) {
  const supabase = await createClient();
  let courseId: string | null = null;
  try {
    const user = await requireCourseOperationsUser(supabase);
    const [membership, body] = await Promise.all([
      requireCourseOperationsMembership(user.id),
      request.json(),
    ]);
    const input = parseCourseOperationsInput(body);
    await assertLinkableItems(membership.workspace_id, input, null);

    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .insert({
        workspace_id: membership.workspace_id,
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
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`강의 생성 실패: ${error.code}`);
    courseId = course.id;

    await replaceCourseChildren(course.id, input);
    await replaceCourseLinks(membership.workspace_id, course.id, input);
    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.course_created",
      entity_type: "course",
      entity_id: course.id,
      metadata: { name: input.name },
    });
    return Response.json({ id: course.id }, { status: 201 });
  } catch (error) {
    if (courseId) {
      await createAdminClient().from("courses").delete().eq("id", courseId);
    }
    return courseOperationsApiError(error);
  }
}
