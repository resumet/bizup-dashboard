import { z } from "zod";
import { authorizeCourseOrders, CourseOrderError, courseOrderErrorResponse } from "@/lib/course-orders/server";

export const runtime = "nodejs";
const inputSchema = z.object({ orderIds: z.array(z.uuid()).max(10_000) });

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const { admin, user } = await authorizeCourseOrders(courseId);
    const input = inputSchema.safeParse(await request.json());
    if (!input.success) throw new CourseOrderError("저장할 주문을 확인해 주세요.");
    const { data, error } = await admin.rpc("save_course_paid_roster", {
      p_course_id: courseId, p_actor_id: user.id, p_order_ids: [...new Set(input.data.orderIds)],
    });
    if (error) throw new CourseOrderError(error.code === "P0001" ? error.message : "유료수강생 명단을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 409);
    return Response.json({ jobId: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
