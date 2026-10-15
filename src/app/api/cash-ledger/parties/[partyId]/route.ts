import { context, failure, json, readBody, saveParty } from "@/lib/cash-ledger/server";
export async function PATCH(request: Request, { params }: { params: Promise<{ partyId: string }> }) { try { return json({ id: await saveParty(await context(), await readBody(request), (await params).partyId) }); } catch (error) { return failure(error); } }
