import { authorizeCourseOrders, courseOrderErrorResponse, loadCourseOrders, readCourseOrderUpload, saveCourseOrders } from "@/lib/course-orders/server";
import { selectCourseOrders } from "@/lib/course-orders/parse";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { admin } = await authorizeCourseOrders(courseId);
    return Response.json(await loadCourseOrders(admin, courseId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { admin, user } = await authorizeCourseOrders(courseId);
    const form = await request.formData();
    let products: unknown;
    try { products = JSON.parse(String(form.get("products") ?? "")); }
    catch { throw new Error("연결할 주문항목을 선택해 주세요."); }
    if (!Array.isArray(products) || !products.every((name) => typeof name === "string")) throw new Error("주문항목 선택 형식이 올바르지 않습니다.");
    const { rows, fileName } = await readCourseOrderUpload(form);
    const selected = selectCourseOrders(rows, products);
    await saveCourseOrders(admin, courseId, user.id, fileName, selected);
    return Response.json({ savedCount: selected.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
