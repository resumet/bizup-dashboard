import { readComparisonFile } from "@/lib/roster-comparison/read-file";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { compareRosters, parseComparisonPayers } from "@/lib/roster-comparison/compare";
import { listComparisonRosters, loadComparisonStudents, parseComparisonRosterIds } from "@/lib/roster-comparison/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const supabase = await createClient();
  if (!await getAuthenticatedUser(supabase)) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  try { return Response.json({ rosters: await listComparisonRosters(supabase) }, { headers }); }
  catch (error) { return Response.json({ message: error instanceof Error ? error.message : "명단 조회 실패" }, { status: 500, headers }); }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!await getAuthenticatedUser(supabase)) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !/\.(xlsx|csv)$/iu.test(file.name) || !file.size || file.size > 4 * 1024 * 1024) throw new Error("4MB 이하의 결제자 명단 .xlsx 또는 .csv 파일을 선택해 주세요.");
    const matchBy = form.get("matchBy");
    if (matchBy !== "phone" && matchBy !== "email") throw new Error("비교 기준을 선택해 주세요.");
    let selected: unknown;
    try { selected = JSON.parse(String(form.get("rosterIds") ?? "")); } catch { throw new Error("수강생 명단 선택 형식이 올바르지 않습니다."); }
    const jobIds = parseComparisonRosterIds(selected);
    const matrix = await readComparisonFile(new Uint8Array(await file.arrayBuffer()), file.name);
    const payers = parseComparisonPayers(matrix, file.name, matchBy);
    const students = await loadComparisonStudents(supabase, jobIds);
    return Response.json(compareRosters(payers, students, matchBy), { headers });
  } catch (error) { return Response.json({ message: error instanceof Error ? error.message : "명단 비교에 실패했습니다." }, { status: 400, headers }); }
}
