import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseStoredSettlementRows } from "@/lib/settlements/storage";

type Context = { params: Promise<{ reportId: string }> };

async function authorize(reportId: string, userId: string) {
  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) throw new Error("FORBIDDEN");
  const { data: report, error } = await admin
    .from("settlement_reports")
    .select("id,name,original_filename,row_count,rows,created_at,updated_at")
    .eq("id", reportId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();
  if (error) {
    throw new Error(
      error.code === "PGRST205"
        ? "정산 저장 DB 마이그레이션을 먼저 적용해 주세요."
        : `정산 분석 조회 실패: ${error.code}`,
    );
  }
  if (!report) throw new Error("NOT_FOUND");
  return { admin, membership, report };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  if (message === "FORBIDDEN") {
    return Response.json({ message: "워크스페이스 권한이 없습니다." }, { status: 403 });
  }
  if (message === "NOT_FOUND") {
    return Response.json({ message: "저장된 정산 분석을 찾을 수 없습니다." }, { status: 404 });
  }
  return Response.json({ message }, { status: 400 });
}

export async function GET(_: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { reportId } = await params;
    const { report } = await authorize(reportId, user.id);
    return Response.json({
      report: { ...report, rows: parseStoredSettlementRows(report.rows) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { reportId } = await params;
    const { admin, membership, report } = await authorize(reportId, user.id);
    const { error } = await admin
      .from("settlement_reports")
      .delete()
      .eq("id", report.id)
      .eq("workspace_id", membership.workspace_id);
    if (error) throw new Error(`정산 분석 삭제 실패: ${error.code}`);
    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "settlement_report.deleted",
      entity_type: "settlement_report",
      entity_id: report.id,
      metadata: { name: report.name, row_count: report.row_count },
    });
    return Response.json({ message: "저장된 정산 분석이 삭제되었습니다." });
  } catch (error) {
    return errorResponse(error);
  }
}
