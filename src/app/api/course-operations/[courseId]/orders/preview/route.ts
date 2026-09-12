import { buildCourseOrderPreview } from "@/lib/course-orders/parse";
import { authorizeCourseOrders, courseOrderErrorResponse, readCourseOrderUpload } from "@/lib/course-orders/server";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const { course } = await authorizeCourseOrders(courseId);
    const { rows } = await readCourseOrderUpload(await request.formData());
    return Response.json(buildCourseOrderPreview(rows, course.name), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
