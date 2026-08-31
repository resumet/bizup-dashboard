import { authorizeSettlement, settlementError } from "@/lib/course-settlements/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ settlementId: string }> };
export async function POST(_: Request, { params }: Context) {
  const supabase = await createClient(); const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { settlementId } = await params; const { admin, settlement, workspaceId } = await authorizeSettlement(settlementId, user.id);
    if (!settlement.latest_version) throw new Error("정산 계산을 먼저 실행해 주세요.");
    const { data: version } = await admin.from("course_settlement_versions").select("id,result_snapshot").eq("settlement_id", settlementId).eq("version", settlement.latest_version).maybeSingle();
    if (!version) throw new Error("최신 정산 버전을 찾을 수 없습니다.");
    const result = version.result_snapshot as { validation?: { unresolvedCount?: number } };
    if (Number(result.validation?.unresolvedCount ?? 0) > 0) throw new Error("미해결 거래 차이가 있어 정산을 확정할 수 없습니다.");
    const { data: requiredExpenses } = await admin.from("course_settlement_expenses").select("id,name").eq("settlement_id", settlementId).eq("evidence_required", true);
    const expenseIds = (requiredExpenses ?? []).map((item) => item.id);
    if (expenseIds.length) {
      const { data: attachments } = await admin.from("course_settlement_expense_attachments").select("expense_id").in("expense_id", expenseIds);
      const attached = new Set((attachments ?? []).map((item) => item.expense_id));
      const missing = (requiredExpenses ?? []).filter((item) => !attached.has(item.id));
      if (missing.length) throw new Error(`필수 증빙이 없습니다: ${missing.map((item) => item.name).join(", ")}`);
    }
    const now = new Date().toISOString();
    await admin.from("course_settlement_versions").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: now }).eq("id", version.id);
    await admin.from("course_settlement_projects").update({ status: "정산확정", updated_at: now }).eq("id", settlementId);
    await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_id: user.id, event_type: "course_settlement.confirmed", entity_type: "course_settlement", entity_id: settlementId, metadata: { version: settlement.latest_version } });
    return Response.json({ ok: true });
  } catch (error) { return settlementError(error); }
}
