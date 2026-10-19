import { context, failure, json, readBody, resolveReceiptParty } from "@/lib/cash-ledger/server";

export async function POST(request: Request) {
  try { return json({ party: await resolveReceiptParty(await context(), await readBody(request)) }); }
  catch (error) { return failure(error); }
}
