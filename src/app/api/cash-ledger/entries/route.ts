import { context, failure, json, readBody, saveEntry } from "@/lib/cash-ledger/server";
export async function POST(request: Request) { try { return json({ entry: await saveEntry(await context(), await readBody(request)) }, 201); } catch (error) { return failure(error); } }
