import { after } from "next/server";
import { z } from "zod";
import { commandSchemas, queryFilter, queryResources, type HrAction } from "@/lib/hr/validation";
import { databaseError, HrError, hrClient, processHrNotifications } from "@/lib/hr/server";
import { deliverHrInvitation, reconcileHrInvitation } from "@/lib/hr/invitations";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) { return error instanceof HrError ? json({ error: error.message, fields: error.fields }, error.status) : json({ error: "요청을 처리하지 못했습니다. 입력을 확인한 후 다시 시도해 주세요." }, 500); }
export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const resource = z.enum(queryResources).safeParse(url.searchParams.get("resource"));
    url.searchParams.delete("resource"); const filter = queryFilter.safeParse(Object.fromEntries(url.searchParams));
    if (!resource.success || !filter.success) throw new HrError("조회 조건을 확인해 주세요.");
    const client = await hrClient();
    const { data, error } = await client.rpc("hr_query", { p_resource: resource.data, p_filter: filter.data });
    if (error) throw databaseError(error);
    return json(data);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new HrError("허용되지 않는 요청 출처입니다.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HrError("JSON 형식으로 요청해 주세요.");
    const raw = await request.text(); if (raw.length > 2_000_000) throw new HrError("입력 내용이 너무 큽니다.", 413);
    let input: unknown; try { input = JSON.parse(raw); } catch { throw new HrError("입력 형식이 올바르지 않습니다."); }
    const envelope = z.object({ action: z.string(), body: z.record(z.string(), z.unknown()) }).strict().safeParse(input);
    const key = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
    if (!envelope.success || !key.success || !Object.hasOwn(commandSchemas, envelope.data.action)) throw new HrError("명령과 요청 식별자를 확인해 주세요.");
    const action = envelope.data.action as HrAction;
    const parsed = commandSchemas[action].safeParse(envelope.data.body);
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) { const field = issue.path.join(".") || "form"; (fields[field] ??= []).push(issue.message); }
      throw new HrError("입력 항목을 확인해 주세요.", 400, fields);
    }
    const client = await hrClient();
    const { data, error } = await client.rpc("hr_command", { p_action: action, p_body: parsed.data, p_key: key.data });
    if (error) throw databaseError(error);
    if (action === "invitation.reserve" || action === "invitation.retry") await deliverHrInvitation(data.id);
    if (action === "invitation.inspect") await reconcileHrInvitation(data.id);
    after(async () => { try { await processHrNotifications(); } catch { /* Domain changes already committed; scheduled worker retries the outbox. */ } });
    return json(data);
  } catch (error) { return failure(error); }
}
