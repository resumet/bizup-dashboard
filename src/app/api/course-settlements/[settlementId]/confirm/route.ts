import {
  authorizeSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { sanitizeSettlementStatementDraft } from "@/lib/course-settlements/statement";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ settlementId: string }> };

export async function POST(_: Request, { params }: Context) {
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
    if (!settlement.analysis_snapshot) {
      throw new Error("정산 엑셀 검증을 먼저 완료해 주세요.");
    }
    const { data: course } = await admin
      .from("courses")
      .select("name")
      .eq("id", settlement.course_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!course) throw new Error("연결된 강의를 찾을 수 없습니다.");
    const draft = sanitizeSettlementStatementDraft(
      settlement.statement_draft,
      course.name,
    );
    if (
      !draft.lectureName ||
      !draft.coursePeriod ||
      !draft.settlementPeriod ||
      !draft.manager
    ) {
      throw new Error("강의명, 강의기간, 정산기간, 담당자를 모두 입력해 주세요.");
    }

    const requiredCosts = draft.costs.filter((cost) => cost.evidenceRequired);
    const { data: attachments, error: attachmentError } = await admin
      .from("course_settlement_draft_attachments")
      .select("cost_id")
      .eq("settlement_id", settlement.id);
    if (attachmentError) throw new Error(`증빙 조회 실패: ${attachmentError.code}`);
    const attachedCostIds = new Set(
      (attachments ?? []).map((attachment) => attachment.cost_id),
    );
    const missingEvidence = requiredCosts.filter(
      (cost) => !attachedCostIds.has(cost.id),
    );
    if (missingEvidence.length && !draft.exceptionReason) {
      throw new Error(
        `필수 증빙이 없습니다: ${missingEvidence.map((cost) => cost.name || "이름 없는 비용").join(", ")}`,
      );
    }

    const now = new Date().toISOString();
    draft.status = "정산확정";
    draft.confirmedAt = now;
    const { data: updated, error } = await admin
      .from("course_settlement_projects")
      .update({
        statement_draft: draft,
        status: "정산확정",
        manager_name: draft.manager,
        instructor_ratio_bps: Math.round(draft.instructorRatioPercent * 100),
        updated_at: now,
      })
      .eq("id", settlement.id)
      .select("*")
      .single();
    if (error || !updated) throw new Error(`정산 확정 실패: ${error?.code}`);
    if (settlement.latest_version) {
      await admin
        .from("course_settlement_versions")
        .update({ status: "confirmed", confirmed_by: user.id, confirmed_at: now })
        .eq("settlement_id", settlement.id)
        .eq("version", settlement.latest_version);
    }
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.confirmed",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: {
        version: settlement.latest_version,
        exception_reason: draft.exceptionReason || null,
      },
    });
    return Response.json({ state: await loadSettlementState(admin, updated) });
  } catch (error) {
    return settlementError(error);
  }
}
