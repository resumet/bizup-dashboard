import { authorizeSettlement, settlementError } from "@/lib/course-settlements/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ settlementId: string; expenseId: string }> };
export async function DELETE(_: Request, { params }: Context) {
  const supabase = await createClient(); const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { settlementId, expenseId } = await params; const { admin } = await authorizeSettlement(settlementId, user.id);
    const { error } = await admin.from("course_settlement_expenses").delete().eq("id", expenseId).eq("settlement_id", settlementId);
    if (error) throw new Error(`비용 삭제 실패: ${error.code}`);
    return Response.json({ ok: true });
  } catch (error) { return settlementError(error); }
}
