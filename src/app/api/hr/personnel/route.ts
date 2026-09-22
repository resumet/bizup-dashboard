import { z } from "zod";
import { personnelInput } from "@/lib/personnel/model";
import { loadPersonnelDetail, personnelDatabaseError, PersonnelError, requirePersonnelContext } from "@/lib/personnel/server";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof PersonnelError) return json({ message: error.message }, error.status);
  if (error instanceof Error && error.message === "UNAUTHORIZED") return json({ message: "로그인이 필요합니다." }, 401);
  if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") return json({ message: "퇴직 처리된 계정은 이용할 수 없습니다." }, 403);
  return json({ message: "요청을 처리하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요." }, 500);
}
export async function GET(request: Request) {
  try {
    const context = await requirePersonnelContext();
    const params = z.object({ id: z.uuid().optional(), year: z.coerce.number().int().min(2000).max(2100).optional(), page: z.coerce.number().int().min(0).max(100000).default(0), q: z.string().max(150).default(""), status: z.enum(["all", "employed", "resigned", "dismissed"]).default("all") }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!params.success) throw new PersonnelError("조회 조건을 확인해 주세요.");
    const filter = params.data;
    if (filter.id) return json(await loadPersonnelDetail(context, filter.id, filter.year ?? Number(context.today.slice(0, 4))));
    const { data, error } = await context.admin.rpc("personnel_query", { p_workspace_id: context.workspaceId, p_actor_id: context.user.id, p_page: filter.page, p_q: filter.q, p_status: filter.status });
    if (error) throw personnelDatabaseError(error);
    return json(data);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new PersonnelError("허용되지 않는 요청 출처입니다.", 403);
    const context = await requirePersonnelContext();
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PersonnelError("JSON 형식으로 요청해 주세요.");
    const raw = await request.text();
    if (raw.length > 30000) throw new PersonnelError("입력 내용이 너무 큽니다.", 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new PersonnelError("입력 형식을 확인해 주세요."); }
    const reveal = z.object({ action: z.literal("reveal"), id: z.uuid() }).strict().safeParse(input);
    if (reveal.success) {
      const result = await context.admin.rpc("personnel_reveal", { p_workspace_id: context.workspaceId, p_actor_id: context.user.id, p_id: reveal.data.id });
      if (result.error) throw personnelDatabaseError(result.error);
      return json({ resident_number: result.data ?? "" });
    }
    const parsed = personnelInput.safeParse(input);
    if (!parsed.success) throw new PersonnelError(parsed.error.issues.map(issue => issue.message).join(" / "));
    const { resident_number, ...body } = parsed.data;
    const payload: Record<string, unknown> = { ...body };
    if (resident_number !== undefined) {
      payload.resident_number = resident_number ? resident_number.replace(/-/g, "") : null;
    }
    const result = await context.admin.rpc("personnel_save", { p_workspace_id: context.workspaceId, p_actor_id: context.user.id, p: payload });
    if (result.error) throw personnelDatabaseError(result.error);
    return json({ id: result.data });
  } catch (error) { return failure(error); }
}
