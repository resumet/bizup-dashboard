import {
  authorizeCourseOrders,
  courseOrderErrorResponse,
  loadCourseOrders,
  readCourseOrderUpload,
  saveCourseOrders,
  syncPaidRosterAfterOrderImport,
} from "@/lib/course-orders/server";
import { selectCourseOrders, shortestSelectedCourseName } from "@/lib/course-orders/parse";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { admin, course } = await authorizeCourseOrders(courseId);
    return Response.json(await loadCourseOrders(admin, courseId, course.free_webinar_at), { headers: { "Cache-Control": "no-store" } });
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
    const warnings: string[] = [];
    let paidRosterSync = null;
    try {
      paidRosterSync = await syncPaidRosterAfterOrderImport(
        admin,
        courseId,
        user.id,
      );
    } catch (syncError) {
      warnings.push(
        syncError instanceof Error
          ? `${syncError.message} 주문내역은 정상 저장되었습니다.`
          : "유료수강생 명단을 자동 갱신하지 못했습니다. 주문내역은 정상 저장되었습니다.",
      );
    }
    if (courseName !== course.name) {
      const { data: updated, error: nameError } = await admin.from("courses")
        .update({ name: courseName }).eq("id", courseId).eq("name", course.name).select("name").maybeSingle();
      if (nameError || !updated) {
        warnings.push("주문 내역은 저장했지만 강의명은 변경하지 못했습니다. 강의 정보를 새로고침한 뒤 확인해 주세요.");
        return Response.json(
          {
            savedCount: selected.length,
            paidRosterSync,
            warning: warnings.join(" "),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      invalidateCourseOperationsList();
    }
    return Response.json(
      {
        savedCount: selected.length,
        courseName,
        paidRosterSync,
        warning: warnings.join(" ") || undefined,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) { return courseOrderErrorResponse(error); }
}
