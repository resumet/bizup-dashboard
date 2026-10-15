import { context, failure, json, uploadAttachment } from "@/lib/cash-ledger/server";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) { try { await uploadAttachment(await context(), (await params).entryId, request); return json({ ok: true }, 201); } catch (error) { return failure(error); } }
