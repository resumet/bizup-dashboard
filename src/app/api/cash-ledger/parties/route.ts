import { context, failure, json, readBody, saveParty } from "@/lib/cash-ledger/server";
export async function POST(request: Request) { try { return json({ id: await saveParty(await context(), await readBody(request)) }, 201); } catch (error) { return failure(error); } }
