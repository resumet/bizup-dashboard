import { authorizeSettlement, settlementError } from "@/lib/course-settlements/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ settlementId: string }> };

export async function POST(request: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { settlementId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const burden = String(body.burden ?? "");
    const amount = Number(body.amount);
    if (!name) throw new Error("비용명을 입력해 주세요.");
    if (!["company", "instructor", "shared"].includes(burden)) throw new Error("부담 주체를 선택해 주세요.");
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("비용을 원 단위 정수로 입력해 주세요.");
    const { admin } = await authorizeSettlement(settlementId, user.id);
    const { data, error } = await admin.from("course_settlement_expenses").insert({
      settlement_id: settlementId, name: name.slice(0, 200), burden, amount,
      occurred_on: body.occurredOn || null, manager_name: String(body.managerName ?? "").trim().slice(0, 100),
      note: String(body.note ?? "").trim().slice(0, 2000), evidence_required: body.evidenceRequired === true,
      evidence_type: String(body.evidenceType ?? "").trim().slice(0, 100), created_by: user.id,
    }).select("*").single();
    if (error || !data) throw new Error(`비용 저장 실패: ${error?.code}`);
    await admin.from("course_settlement_projects").update({ status: "비용입력중", updated_at: new Date().toISOString() }).eq("id", settlementId);
    return Response.json({ expense: data }, { status: 201 });
  } catch (error) { return settlementError(error); }
}
