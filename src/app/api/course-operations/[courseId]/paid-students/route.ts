import { z } from "zod";
import { createHash } from "node:crypto";
import { authorizeCourseOrders, CourseOrderError, courseOrderErrorResponse } from "@/lib/course-orders/server";
import { planPaidRoster, type RosterSnapshot } from "@/lib/course-orders/reconcile-roster";

export const runtime = "nodejs";
const inputSchema = z.object({
  orderIds: z.array(z.uuid()).max(10_000), action: z.enum(["preview", "apply"]).optional(),
  token: z.string().max(64).optional(), selectedIds: z.array(z.uuid()).max(10_000).optional(),
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const { admin, user } = await authorizeCourseOrders(courseId);
    const input = inputSchema.safeParse(await request.json());
    if (!input.success) throw new CourseOrderError("저장할 주문을 확인해 주세요.");
    const orderIds = [...new Set(input.data.orderIds)].sort();
    const headers = { "Cache-Control": "no-store" };
    // The paid tab can still initialize an empty roster without an orders preview.
    if (!orderIds.length && !input.data.action) {
      const { data, error } = await admin.rpc("save_course_paid_roster", { p_course_id: courseId, p_actor_id: user.id, p_order_ids: [] });
      if (error) throw new CourseOrderError("유료수강생 명단을 준비하지 못했습니다.", 409);
      return Response.json({ jobId: data }, { headers });
    }
    if (!input.data.action) throw new CourseOrderError("화면을 새로고침하고 변경 미리보기를 확인해 주세요.", 409);
    const { data: snapshot, error: snapshotError } = await admin.rpc("paid_roster_snapshot", {
      p_course_id: courseId, p_actor_id: user.id,
    });
    if (snapshotError) throw new CourseOrderError("변경 미리보기를 불러오지 못했습니다.", 500);
    const state = snapshot as RosterSnapshot;
    if (orderIds.some(id => !state.orders.some(order => order.id === id && order.status.normalize("NFKC").replace(/\s/gu, "") === "결제완료"))) {
      throw new CourseOrderError("주문이 변경되었습니다. 주문내역을 새로고침해 주세요.", 409);
    }
    const token = createHash("sha256").update(JSON.stringify(canonical({ snapshot, orderIds }))).digest("hex");
    const plan = planPaidRoster(state, orderIds);
    if (input.data.action === "preview") return Response.json({ ...plan, token }, { headers });
    if (input.data.token !== token) throw new CourseOrderError("주문 또는 수강생 정보가 변경되었습니다. 미리보기를 다시 열어 확인해 주세요.", 409);
    const selectedIds = new Set(input.data.selectedIds ?? []);
    const changes = plan.changes.filter(change => selectedIds.has(change.id));
    if (!changes.length || changes.length !== selectedIds.size) throw new CourseOrderError("반영할 항목을 다시 선택해 주세요.");
    const { data, error } = await admin.rpc("apply_paid_roster_changes", {
      p_course_id: courseId, p_actor_id: user.id, p_snapshot: snapshot,
      p_changes: changes.map(({ orderId, targetId, removeIds }) => ({ orderId, targetId, removeIds })),
    });
    if (error) throw new CourseOrderError(error.code === "P0001" ? error.message : "유료수강생 명단을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 409);
    return Response.json({ jobId: data, appliedCount: changes.length }, { headers });
  } catch (error) { return courseOrderErrorResponse(error); }
}
