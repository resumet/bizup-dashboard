import { authorizeCourseOrders, courseOrderErrorResponse } from "@/lib/course-orders/server";
import { prepareOrderMessageContact } from "@/lib/course-orders/message-contact";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ courseId: string; orderId: string }> }) {
  try {
    const { courseId, orderId } = await params;
    const { admin, course, user } = await authorizeCourseOrders(courseId);
    return Response.json(await prepareOrderMessageContact(admin, course, user.id, orderId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
