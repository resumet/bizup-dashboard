import { authorizeCourseOrders, courseOrderErrorResponse, loadCourseOrders, readCourseOrderUpload, saveCourseOrders } from "@/lib/course-orders/server";
import { selectCourseOrders, shortestSelectedCourseName } from "@/lib/course-orders/parse";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";

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
    const { admin, user, course } = await authorizeCourseOrders(courseId);
    const form = await request.formData();
    let products: unknown;
    try { products = JSON.parse(String(form.get("products") ?? "")); }
    catch { throw new Error("연결할 주문항목을 선택해 주세요."); }
    if (!Array.isArray(products) || !products.every((name) => typeof name === "string")) throw new Error("주문항목 선택 형식이 올바르지 않습니다.");
    const { rows, fileName } = await readCourseOrderUpload(form);
    const selected = selectCourseOrders(rows, products);
    const courseName = shortestSelectedCourseName(selected.map((row) => row.productName));
    if (!courseName || courseName.length > 200) throw new Error("선택한 주문항목의 강의명은 1~200자여야 합니다.");
    await saveCourseOrders(admin, courseId, user.id, fileName, selected);
    if (courseName !== course.name) {
      const { data: updated, error: nameError } = await admin.from("courses")
        .update({ name: courseName }).eq("id", courseId).eq("name", course.name).select("name").maybeSingle();
      if (nameError || !updated) {
        return Response.json({ savedCount: selected.length, warning: "주문 내역은 저장했지만 강의명은 변경하지 못했습니다. 강의 정보를 새로고침한 뒤 확인해 주세요." }, { headers: { "Cache-Control": "no-store" } });
      }
      invalidateCourseOperationsList();
    }
    return Response.json({ savedCount: selected.length, courseName }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return courseOrderErrorResponse(error); }
}
