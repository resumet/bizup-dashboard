import { context, deleteEntry, failure, json, readBody, saveEntry } from "@/lib/cash-ledger/server";
type Route = { params: Promise<{ entryId: string }> };
export async function PATCH(request: Request, { params }: Route) { try { return json({ entry: await saveEntry(await context(), await readBody(request), (await params).entryId) }); } catch (error) { return failure(error); } }
export async function DELETE(request: Request, { params }: Route) { try { await deleteEntry(await context(), (await params).entryId, await readBody(request)); return json({ ok: true }); } catch (error) { return failure(error); } }
