import {
  authorizeSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = {
  params: Promise<{ settlementId: string; attachmentId: string }>;
};

export async function DELETE(_: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { settlementId, attachmentId } = await params;
    const { admin, workspaceId, settlement } = await authorizeSettlement(
      settlementId,
      user.id,
    );
    const { data: attachment } = await admin
      .from("course_settlement_draft_attachments")
      .select("id,storage_path,cost_id")
      .eq("id", attachmentId)
      .eq("settlement_id", settlement.id)
      .maybeSingle();
    if (!attachment) throw new Error("삭제할 증빙 파일을 찾을 수 없습니다.");
    const { error } = await admin
      .from("course_settlement_draft_attachments")
      .delete()
      .eq("id", attachment.id);
    if (error) throw new Error(`증빙 기록 삭제 실패: ${error.code}`);
    await admin.storage
      .from("settlement-evidence")
      .remove([attachment.storage_path]);
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.evidence_deleted",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: { cost_id: attachment.cost_id, attachment_id: attachment.id },
    });
    return Response.json({
      state: await loadSettlementState(admin, settlement),
    });
  } catch (error) {
    return settlementError(error);
  }
}
