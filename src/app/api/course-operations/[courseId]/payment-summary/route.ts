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
    const body = await request.json() as Record<string, unknown>;
    const cohort = typeof body.cohort === "string" ? body.cohort.trim() : "";
    const novaSettled = body.novaSettled;
    const instructorSettled = body.instructorSettled;
    if (cohort.length > 100 || typeof novaSettled !== "boolean" || typeof instructorSettled !== "boolean") {
      return Response.json({ message: "정산 정보 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .update({
        cohort,
        nova_settled: novaSettled,
        instructor_settled: instructorSettled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`정산 정보 저장 실패 (${error.code})`);
    if (!course) return Response.json({ message: "강의를 찾을 수 없습니다." }, { status: 404 });
    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.payment_summary_saved",
      entity_type: "course",
      entity_id: courseId,
      metadata: { cohort, novaSettled, instructorSettled },
    });
    return Response.json({ id: courseId });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "정산 정보를 저장하지 못했습니다." }, { status: 400 });
  }
}
