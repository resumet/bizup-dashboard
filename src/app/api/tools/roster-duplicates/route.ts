import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { findRosterDuplicates } from "@/lib/roster-comparison/compare";
import { loadComparisonStudents, parseComparisonRosterIds } from "@/lib/roster-comparison/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!await getAuthenticatedUser(supabase)) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  try {
    const input = await request.json();
    if (!input || (input.matchBy !== "phone" && input.matchBy !== "email")) throw new Error("중복 검사 기준을 선택해 주세요.");
    const jobIds = parseComparisonRosterIds(input.rosterIds);
    const contacts = await loadComparisonStudents(supabase, jobIds);
    return Response.json(findRosterDuplicates(contacts, input.matchBy), { headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "중복 검사에 실패했습니다." }, { status: 400, headers });
  }
}
