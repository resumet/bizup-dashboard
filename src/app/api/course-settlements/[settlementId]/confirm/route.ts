import {
  authorizeSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { sanitizeSettlementStatementDraft } from "@/lib/course-settlements/statement";
import { filterSettlementCosts, loadCourseCosts } from "@/lib/course-costs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAdminAccess } from "@/lib/admin/access";

type Context = { params: Promise<{ settlementId: string }> };

export async function POST(_: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { settlementId } = await params;
    const { admin, workspaceId, role, settlement } = await authorizeSettlement(
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
    if (draft.confirmedAt) throw new Error("이미 확정된 정산서입니다.");
    if (
      !draft.lectureName ||
      !draft.coursePeriod ||
      !draft.settlementPeriod ||
      !draft.manager
    ) {
      throw new Error("강의명, 강의기간, 정산기간, 담당자를 모두 입력해 주세요.");
    }

    const costs = filterSettlementCosts(
      await loadCourseCosts(admin, settlement.course_id),
      settlement.analysis_snapshot,
    );
    const missingEvidence = costs.filter(
      (cost) => cost.evidenceRequired && cost.attachments.length === 0,
    );
    if (missingEvidence.length && !draft.exceptionReason) {
      throw new Error(
        `필수 증빙이 없습니다: ${missingEvidence.map((cost) => cost.name || "이름 없는 비용").join(", ")}`,
      );
    }

    const now = new Date().toISOString();
    // 새 확정본은 비용 원장 스냅샷만 사용한다. JSON 비용은 과거 확정본 호환용이다.
    draft.costs = [];
    draft.status = "정산확정";
    draft.confirmedAt = now;
    if (costs.length) {
      const { error: snapshotError } = await admin
        .from("settlement_cost_snapshots")
        .upsert(
          costs.map((cost) => ({
            settlement_id: settlement.id,
            course_cost_id: cost.id,
            cost_snapshot: cost,
          })),
          { onConflict: "settlement_id,course_cost_id" },
        );
      if (snapshotError) throw new Error(`비용 스냅샷 저장 실패: ${snapshotError.code}`);
      await admin.from("course_cost_audit_logs").insert(costs.map((cost) => ({
        course_cost_id: cost.id,
        course_id: settlement.course_id,
        actor_id: user.id,
        action: "SETTLEMENT_CHANGED",
        after_data: { settlement_id: settlement.id, included: true },
      })));
    }
    if (missingEvidence.length && !hasAdminAccess(user.email, role)) {
      return Response.json({ message: "필수 증빙 미등록 비용의 예외 확정은 관리자만 할 수 있습니다." }, { status: 403 });
    }

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
        cost_count: costs.length,
      },
    });
    return Response.json({ state: await loadSettlementState(admin, updated) });
  } catch (error) {
    return settlementError(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { settlementId } = await params;
    const { admin, workspaceId, role, settlement } = await authorizeSettlement(settlementId, user.id);
    if (!hasAdminAccess(user.email, role)) {
      return Response.json({ message: "관리자만 정산 확정을 취소할 수 있습니다." }, { status: 403 });
    }
    const { data: course } = await admin.from("courses").select("name").eq("id", settlement.course_id).maybeSingle();
    if (!course) throw new Error("연결된 강의를 찾을 수 없습니다.");
    const draft = sanitizeSettlementStatementDraft(settlement.statement_draft, course.name);
    draft.status = "검토대기";
    draft.confirmedAt = "";
    const now = new Date().toISOString();
    const { data: updated, error } = await admin.from("course_settlement_projects").update({
      status: "비용입력중",
      statement_draft: draft,
      updated_at: now,
    }).eq("id", settlement.id).select("*").single();
    if (error || !updated) throw new Error(`정산 확정 취소 실패: ${error?.code}`);
    const { data: snapshots } = await admin.from("settlement_cost_snapshots").select("course_cost_id").eq("settlement_id", settlement.id);
    await admin.from("settlement_cost_snapshots").delete().eq("settlement_id", settlement.id);
    const costIds = (snapshots ?? []).flatMap((item) => item.course_cost_id ? [item.course_cost_id as string] : []);
    if (costIds.length) {
      await admin.from("course_cost_audit_logs").insert(costIds.map((costId) => ({
        course_cost_id: costId,
        course_id: settlement.course_id,
        actor_id: user.id,
        action: "SETTLEMENT_CHANGED",
        after_data: { settlement_id: settlement.id, included: false },
      })));
    }
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.reopened",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: { previous_version: settlement.latest_version },
    });
    return Response.json({ state: await loadSettlementState(admin, updated) });
  } catch (error) {
    return settlementError(error);
  }
}
