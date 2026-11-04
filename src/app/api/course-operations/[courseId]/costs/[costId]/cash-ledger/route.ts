import { authorizeCourseCosts, courseCostError, loadCourseCosts } from "@/lib/course-costs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ courseId: string; costId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(_: Request, { params }: Context) {
  try {
    const user = await getAuthenticatedUser(await createClient());
    if (!user) throw new Error("로그인이 필요합니다.");
    const { courseId, costId } = await params;
    if (!UUID_PATTERN.test(costId)) throw new Error("비용 정보를 확인해 주세요.");
    const { admin, workspaceId, locked } = await authorizeCourseCosts(courseId, user.id);
    const { data: entryId, error } = await admin.rpc("record_course_ad_operation_ledger_expense", {
      p_course_id: courseId,
      p_course_cost_id: costId,
      p_actor_id: user.id,
    });
    if (error || typeof entryId !== "string") throw new Error(error?.message ?? "입출금 장부 기록에 실패했습니다.");
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_cost.ad_operation_recorded_in_ledger",
      entity_type: "course_cost",
      entity_id: costId,
      metadata: { course_id: courseId, cash_ledger_entry_id: entryId },
    });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked });
  } catch (error) {
    return courseCostError(error);
  }
}
