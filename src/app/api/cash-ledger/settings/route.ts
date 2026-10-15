import { context, failure, json, readBody, saveSettings } from "@/lib/cash-ledger/server";
export async function PUT(request: Request) { try { await saveSettings(await context(), await readBody(request)); return json({ ok: true }); } catch (error) { return failure(error); } }
