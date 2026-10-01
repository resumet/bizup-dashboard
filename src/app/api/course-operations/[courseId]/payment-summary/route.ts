import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";
import { buildPaymentSummaryUpdate, parsePaymentSummaryPatch } from "@/lib/course-operations/payment-summary-patch";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ courseId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    const patch = parsePaymentSummaryPatch(await request.json());

    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .update({
        ...buildPaymentSummaryUpdate(patch),
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`정산 정보 저장 실패 (${error.code})`);
    if (!course) return Response.json({ message: "강의를 찾을 수 없습니다." }, { status: 404 });
    invalidateCourseOperationsList();
    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.payment_summary_saved",
      entity_type: "course",
      entity_id: courseId,
      metadata: patch,
    });
    return Response.json({ id: courseId });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "정산 정보를 저장하지 못했습니다." }, { status: 400 });
  }
}
