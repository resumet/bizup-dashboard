import { context, failure, json, loadState } from "@/lib/cash-ledger/server";
export async function GET() { try { return json({ state: await loadState(await context()) }); } catch (error) { return failure(error); } }
