import { revalidatePath } from "next/cache";

import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";
import { studentSettlementResetSchema } from "@/lib/course-operations/student-settlement-reset";
import {
  authorizeCourseOrders,
  CourseOrderError,
  courseOrderErrorResponse,
} from "@/lib/course-orders/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const { admin, user, course } = await authorizeCourseOrders(courseId);
    const input = studentSettlementResetSchema.safeParse(await request.json());
    if (!input.success) {
      throw new CourseOrderError("리셋할 항목과 확인용 강의명을 입력해 주세요.");
    }
    if (input.data.confirmation !== course.name.trim()) {
      throw new CourseOrderError("강의명이 일치하지 않습니다. 새로고침 후 현재 강의명을 정확히 입력해 주세요.", 409);
    }

    // The database rechecks authorization and the confirmation under the same
    // course lock used by order imports and paid-roster reconciliation.
    const { data, error } = await admin.rpc("reset_course_student_settlement_data", {
      p_course_id: courseId,
      p_actor_id: user.id,
      p_target: input.data.target,
      p_confirmation: input.data.confirmation,
    });
    if (error) {
      if (error.code === "42501") throw new CourseOrderError("이 강의의 자료를 리셋할 권한이 없습니다.", 403);
      if (error.code === "P0002") throw new CourseOrderError("강의를 찾을 수 없습니다.", 404);
      if (error.code === "P0001" || error.code === "22023") throw new CourseOrderError(error.message, 409);
      throw new CourseOrderError("자료를 리셋하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }

    // The transaction has committed. A cache refresh failure must not tell the
    // user the reset failed and encourage a second destructive request.
    try {
      invalidateCourseOperationsList();
      revalidatePath("/services/course-operations/students-settlements");
      revalidatePath(`/services/course-operations/students-settlements/${courseId}`);
    } catch {
      console.error("course_student_settlement_reset_revalidation_failed", { courseId });
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return courseOrderErrorResponse(error);
  }
}
