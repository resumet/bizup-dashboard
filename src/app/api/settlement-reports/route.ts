import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseStoredSettlementRows } from "@/lib/settlements/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      name?: unknown;
      originalFilename?: unknown;
      rows?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const originalFilename =
      typeof body.originalFilename === "string"
        ? body.originalFilename.trim().slice(0, 500)
        : "";
    if (!name) throw new Error("저장할 분석 이름을 입력해 주세요.");
    if (name.length > 200) throw new Error("분석 이름은 200자 이하로 입력해 주세요.");
    const rows = parseStoredSettlementRows(body.rows);

    const admin = createAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return Response.json(
        { message: "워크스페이스 권한이 없습니다." },
        { status: 403 },
      );
    }

    const { data: report, error } = await admin
      .from("settlement_reports")
      .insert({
        workspace_id: membership.workspace_id,
        name,
        original_filename: originalFilename,
        row_count: rows.length,
        rows,
        created_by: user.id,
      })
      .select("id,name,original_filename,row_count,created_at,updated_at")
      .single();
    if (error || !report) {
      throw new Error(
        error?.code === "PGRST205"
          ? "정산 저장 DB 마이그레이션을 먼저 적용해 주세요."
          : `정산 분석 저장 실패: ${error?.code ?? "UNKNOWN"}`,
      );
    }

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "settlement_report.created",
      entity_type: "settlement_report",
      entity_id: report.id,
      metadata: { name, row_count: rows.length, original_filename: originalFilename },
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "정산 분석을 저장하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
