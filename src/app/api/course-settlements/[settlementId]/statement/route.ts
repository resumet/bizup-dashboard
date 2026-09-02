import {
  authorizeSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { sanitizeSettlementStatementDraft } from "@/lib/course-settlements/statement";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ settlementId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { settlementId } = await params;
    const { admin, workspaceId, settlement } = await authorizeSettlement(
      settlementId,
      user.id,
    );
    const { data: course } = await admin
      .from("courses")
      .select("name")
      .eq("id", settlement.course_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!course) throw new Error("연결된 강의를 찾을 수 없습니다.");
    const draft = sanitizeSettlementStatementDraft(
      (await request.json() as { draft?: unknown }).draft,
      course.name,
    );
    if (draft.status === "정산확정") draft.status = "작성중";
    draft.confirmedAt = "";

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("course_settlement_projects")
      .update({
        statement_draft: draft,
        instructor_ratio_bps: Math.round(draft.instructorRatioPercent * 100),
        manager_name: draft.manager,
        status: settlement.analysis_snapshot ? "비용입력중" : "자료대기",
        updated_at: now,
      })
      .eq("id", settlement.id)
      .select("*")
      .single();
    if (error || !updated) throw new Error(`정산서 저장 실패: ${error?.code}`);

    const costIds = new Set(draft.costs.map((cost) => cost.id));
    const { data: attachments } = await admin
      .from("course_settlement_draft_attachments")
      .select("id,cost_id,storage_path")
      .eq("settlement_id", settlement.id);
    const orphanedAttachments = (attachments ?? []).filter(
      (attachment) => !costIds.has(attachment.cost_id),
    );
    if (orphanedAttachments.length) {
      await admin
        .from("course_settlement_draft_attachments")
        .delete()
        .in(
          "id",
          orphanedAttachments.map((attachment) => attachment.id),
        );
      await admin.storage
        .from("settlement-evidence")
        .remove(
          orphanedAttachments.map((attachment) => attachment.storage_path),
        );
    }
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.statement_saved",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: { cost_count: draft.costs.length },
    });
    return Response.json({ state: await loadSettlementState(admin, updated) });
  } catch (error) {
    return settlementError(error);
  }
}
