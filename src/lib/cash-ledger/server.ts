import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import "server-only";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { attachmentType, entrySchema, idSchema, partySchema, settingsSchema, versionSchema, type LedgerState, type LedgerCourse } from "./model";
import { normalizePartyName } from "./receipt";

const BUCKET = "cash-ledger-evidence";
export class LedgerError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
export function failure(error: unknown) {
  if (error instanceof LedgerError) return json({ message: error.message }, error.status);
  if (error instanceof ZodError) return json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, 400);
  console.error("cash_ledger_failed", error instanceof Error ? error.message : "Unknown error");
  return json({ message: "입출금 장부를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "23505" || error.code === "40001") throw new LedgerError("다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도해 주세요.", 409);
  if (error.code === "42501") throw new LedgerError("장부에 접근할 권한이 없습니다.", 403);
  if (error.code === "23514" || error.code === "23503") throw new LedgerError("기록 시작일 이전의 내역은 저장할 수 없습니다. 시작일, 거래처, 관련 강의를 확인해 주세요.");
  throw new Error(`Ledger database: ${error.code}`);
}
export async function context() {
  const db = await createClient();
  const user = await getAuthenticatedUser(db);
  if (!user) throw new LedgerError("로그인이 필요합니다.", 401);
  const membership = await requireCourseOperationsMembership(user.id);
  return { db, workspaceId: membership.workspace_id as string };
}
type Context = Awaited<ReturnType<typeof context>>;
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
  try { const source = new URL(origin); if (["http:", "https:"].includes(source.protocol) && source.host === host) return; } catch { /* Reject malformed origins. */ }
  throw new LedgerError("다른 사이트에서 보낸 요청은 허용하지 않습니다.", 403);
}
export async function readBody(request: Request) {
  assertOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new LedgerError("JSON 요청이 필요합니다.");
  try { return await request.json(); } catch { throw new LedgerError("요청 내용을 확인해 주세요."); }
}
type PartyRow = { id: string; name: string; bank_name: string; account_number: string; account_holder: string; note: string; version: number };
type EntryRow = { id: string; entry_number: number; kind: "income" | "expense"; title: string; party_id: string; course_id: string | null; amount: number; entry_date: string; note: string; version: number };
type AttachmentRow = { id: string; entry_id: string; original_name: string; file_size: number; mime_type: string };
async function allRows<Row>(ctx: Context, table: string, columns = "*") {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await ctx.db.from(table).select(columns).eq("workspace_id", ctx.workspaceId).order("id").range(offset, offset + 499);
    check(error); rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 500) return rows;
  }
}
export async function loadState(ctx: Context): Promise<LedgerState> {
  const [settings, parties, entries, courses, attachments] = await Promise.all([
    ctx.db.from("cash_ledger_settings").select("*").eq("workspace_id", ctx.workspaceId).maybeSingle(),
    allRows<PartyRow>(ctx, "cash_ledger_parties"), allRows<EntryRow>(ctx, "cash_ledger_entries"),
    allRows<LedgerCourse>(ctx, "courses", "id,name,status,instructor_name,cohort,free_webinar_at"), allRows<AttachmentRow>(ctx, "cash_ledger_attachments"),
  ]);
  check(settings.error);
  return {
    settings: settings.data ? { startDate: settings.data.start_date, openingBalance: Number(settings.data.opening_balance), version: settings.data.version } : null,
    parties: parties.map(p => ({ id: p.id, name: p.name, bankName: p.bank_name, accountNumber: p.account_number, accountHolder: p.account_holder, note: p.note, version: p.version })).sort((a, b) => a.name.localeCompare(b.name, "ko")),
    entries: entries.map(e => ({ id: e.id, number: Number(e.entry_number), kind: e.kind, title: e.title, partyId: e.party_id, courseId: e.course_id, amount: Number(e.amount), entryDate: e.entry_date, note: e.note, version: e.version })),
    courses: sortByNearestWebinar(courses).map(c => ({ id: c.id, name: c.name, status: c.status, instructor_name: c.instructor_name, cohort: c.cohort })),
    attachments: attachments.map(a => ({ id: a.id, entryId: a.entry_id, name: a.original_name, size: a.file_size, mimeType: a.mime_type })),
  };
}
export async function saveSettings(ctx: Context, input: unknown) {
  const value = settingsSchema.parse(input);
  const patch = { start_date: value.startDate, opening_balance: value.openingBalance };
  const result = value.version === null
    ? await ctx.db.from("cash_ledger_settings").insert({ ...patch, workspace_id: ctx.workspaceId }).select("workspace_id").single()
    : await ctx.db.from("cash_ledger_settings").update(patch).eq("workspace_id", ctx.workspaceId).eq("version", value.version).select("workspace_id").maybeSingle();
  check(result.error); if (!result.data) throw new LedgerError("시작 잔고가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
}
export async function saveParty(ctx: Context, input: unknown, id?: string) {
  const value = partySchema.parse(input);
  const patch = { name: value.name, bank_name: value.bankName, account_number: value.accountNumber, account_holder: value.accountHolder, note: value.note };
  const result = id
    ? await ctx.db.from("cash_ledger_parties").update(patch).eq("id", idSchema.parse(id)).eq("workspace_id", ctx.workspaceId).eq("version", versionSchema.parse((input as { version?: unknown }).version)).select("id").maybeSingle()
    : await ctx.db.from("cash_ledger_parties").insert({ ...patch, workspace_id: ctx.workspaceId }).select("id").single();
  check(result.error); if (!result.data) throw new LedgerError("거래처가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  return result.data.id as string;
}
export async function resolveReceiptParty(ctx: Context, input: unknown) {
  const name = partySchema.shape.name.parse((input as { name?: unknown } | null)?.name);
  const parties = await allRows<PartyRow>(ctx, "cash_ledger_parties");
  const matches = parties.filter(party => normalizePartyName(party.name) === normalizePartyName(name));
  if (matches.length > 1) throw new LedgerError("같은 이름의 거래처가 여러 개 있습니다. 지급대상 목록에서 직접 선택해 주세요.", 409);
  const existing = matches[0];
  if (existing) return { id: existing.id, name: existing.name, bankName: existing.bank_name, accountNumber: existing.account_number, accountHolder: existing.account_holder, note: existing.note, version: existing.version };
  const value = { name, bankName: "", accountNumber: "", accountHolder: "", note: "" };
  return { ...value, id: await saveParty(ctx, value), version: 1 };
}
export async function saveEntry(ctx: Context, input: unknown, id?: string) {
  const value = entrySchema.parse(input);
  const requestId = id ? undefined : idSchema.parse((input as { requestId?: unknown }).requestId);
  const patch = { kind: value.kind, title: value.title, party_id: value.partyId, course_id: value.courseId, amount: value.amount, entry_date: value.entryDate, note: value.note };
  const result = id
    ? await ctx.db.from("cash_ledger_entries").update(patch).eq("id", idSchema.parse(id)).eq("workspace_id", ctx.workspaceId).eq("version", versionSchema.parse((input as { version?: unknown }).version)).select("id,version").maybeSingle()
    : await ctx.db.from("cash_ledger_entries").insert({ ...patch, id: requestId, workspace_id: ctx.workspaceId }).select("id,version").single();
  // A lost response may cause the same create request to be retried. Never duplicate a payment.
  if (!id && result.error?.code === "23505") {
    const previous = await ctx.db.from("cash_ledger_entries").select("*").eq("id", requestId!).eq("workspace_id", ctx.workspaceId).maybeSingle();
    check(previous.error);
    if (previous.data && Object.entries(patch).every(([key, expected]) => previous.data[key] === expected)) {
      return { id: previous.data.id as string, version: previous.data.version as number };
    }
  }
  check(result.error); if (!result.data) throw new LedgerError("내역이 수정되거나 삭제되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  return result.data as { id: string; version: number };
}
export async function requireEntry(ctx: Context, id: string) {
  const result = await ctx.db.from("cash_ledger_entries").select("id").eq("id", idSchema.parse(id)).eq("workspace_id", ctx.workspaceId).maybeSingle();
  check(result.error); if (!result.data) throw new LedgerError("내역을 찾을 수 없습니다.", 404);
}
export async function deleteEntry(ctx: Context, id: string, input: unknown) {
  idSchema.parse(id);
  const version = versionSchema.parse((input as { version?: unknown })?.version);
  const files = await ctx.db.from("cash_ledger_attachments").select("storage_path").eq("workspace_id", ctx.workspaceId).eq("entry_id", id);
  check(files.error);
  const result = await ctx.db.from("cash_ledger_entries").delete().eq("id", id).eq("workspace_id", ctx.workspaceId).eq("version", version).select("id").maybeSingle();
  check(result.error); if (!result.data) throw new LedgerError("내역이 수정되거나 삭제되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  if (files.data?.length) {
    const cleanup = await createAdminClient().storage.from(BUCKET).remove(files.data.map(f => f.storage_path));
    if (cleanup.error) console.error("cash_ledger_file_cleanup_failed", cleanup.error.message);
  }
}
export async function uploadAttachment(ctx: Context, entryId: string, request: Request) {
  assertOrigin(request); await requireEntry(ctx, entryId);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new LedgerError("첨부할 파일을 선택해 주세요.");
  let format;
  try { format = attachmentType(file); } catch (error) { throw new LedgerError((error as Error).message); }
  const id = crypto.randomUUID();
  const path = `${ctx.workspaceId}/${entryId}/${id}.${format.extension}`;
  const admin = createAdminClient();
  const upload = await admin.storage.from(BUCKET).upload(path, file, { contentType: format.mime, upsert: false });
  if (upload.error) throw new Error(`Ledger upload: ${upload.error.message}`);
  const record = await admin.from("cash_ledger_attachments").insert({ id, workspace_id: ctx.workspaceId, entry_id: entryId, storage_path: path, original_name: file.name, mime_type: format.mime, file_size: file.size });
  if (record.error) { await admin.storage.from(BUCKET).remove([path]); check(record.error); }
}
export async function attachmentAction(ctx: Context, entryId: string, attachmentId: string, remove = false) {
  await requireEntry(ctx, entryId);
  const result = await ctx.db.from("cash_ledger_attachments").select("id,storage_path,original_name").eq("id", idSchema.parse(attachmentId)).eq("entry_id", entryId).eq("workspace_id", ctx.workspaceId).maybeSingle();
  check(result.error); if (!result.data) throw new LedgerError("첨부파일을 찾을 수 없습니다.", 404);
  const admin = createAdminClient();
  if (remove) {
    const deleted = await admin.from("cash_ledger_attachments").delete().eq("id", result.data.id).eq("workspace_id", ctx.workspaceId);
    check(deleted.error);
    const cleanup = await admin.storage.from(BUCKET).remove([result.data.storage_path]);
    if (cleanup.error) console.error("cash_ledger_file_cleanup_failed", cleanup.error.message);
    return null;
  }
  const signed = await admin.storage.from(BUCKET).createSignedUrl(result.data.storage_path, 60);
  if (signed.error || !signed.data) throw new Error("Ledger attachment URL failed");
  return signed.data.signedUrl;
}
