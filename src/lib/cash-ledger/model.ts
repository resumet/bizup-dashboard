import { z } from "zod";

export const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_FILE_SIZE = 4 * 1024 * 1024;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 입력해 주세요.").refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}, "올바른 날짜를 입력해 주세요.");
export const versionSchema = z.number().int().positive();
export const idSchema = z.string().uuid();
export const settingsSchema = z.object({ startDate: date, openingBalance: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT), version: versionSchema.nullable() });
export const partySchema = z.object({ name: z.string().trim().min(1, "거래처명을 입력해 주세요.").max(120), bankName: z.string().trim().max(100), accountNumber: z.string().trim().max(100), accountHolder: z.string().trim().max(120), note: z.string().trim().max(2000) });
export const entrySchema = z.object({ kind: z.enum(["expense", "income"]), title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200), partyId: idSchema, courseId: idSchema.nullable(), amount: z.number().int().min(1, "금액은 1원 이상 입력해 주세요.").max(MAX_AMOUNT), entryDate: date, note: z.string().trim().max(4000) });
export type Settings = { startDate: string; openingBalance: number; version: number };
export type PartyInput = z.infer<typeof partySchema>;
export type Party = PartyInput & { id: string; version: number };
export type EntryInput = z.infer<typeof entrySchema>;
export type Entry = EntryInput & { id: string; number: number; version: number };
export type LedgerCourse = { id: string; name: string; status: string; instructor_name: string };
export type Attachment = { id: string; entryId: string; name: string; size: number; mimeType: string };
export type LedgerState = { settings: Settings | null; parties: Party[]; entries: Entry[]; courses: LedgerCourse[]; attachments: Attachment[] };

export function summarizeLedger(settings: Settings | null, entries: readonly Entry[]) {
  let income = BigInt(0), expense = BigInt(0);
  const dailyChanges = new Map<string, bigint>();
  for (const entry of entries) {
    const amount = BigInt(entry.amount);
    if (entry.kind === "income") income += amount; else expense += amount;
    dailyChanges.set(entry.entryDate, (dailyChanges.get(entry.entryDate) ?? BigInt(0)) + (entry.kind === "income" ? amount : -amount));
  }
  let balance = BigInt(settings?.openingBalance ?? 0);
  const balances = new Map<string, bigint>();
  for (const day of [...dailyChanges.keys()].sort()) { balance += dailyChanges.get(day)!; balances.set(day, balance); }
  return { income, expense, balance, balances };
}
export function visibleEntries(state: LedgerState, query: string) {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  const amountNeedle = needle.replace(/[,₩원\s]/g, "");
  const parties = new Map(state.parties.map(party => [party.id, party.name]));
  const courses = new Map(state.courses.map(course => [course.id, course.name]));
  return state.entries.filter(entry => !needle ||
    [entry.title, parties.get(entry.partyId) ?? "", courses.get(entry.courseId ?? "") ?? "", entry.note].some(value => value.toLocaleLowerCase("ko-KR").includes(needle)) ||
    (/^\d+$/.test(amountNeedle) && String(entry.amount).includes(amountNeedle))
  ).sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.number - a.number);
}
export function formatMoney(value: number | bigint) { return new Intl.NumberFormat("ko-KR").format(value); }
export function moneyInput(value: string, signed = false) {
  const negative = signed && value.startsWith("-");
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
const fileTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv" };
export function attachmentType(file: { name: string; type: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = fileTypes[extension];
  if (!mime || (file.type && file.type !== mime && !(extension === "csv" && file.type === "application/vnd.ms-excel"))) throw new Error("이미지, PDF, Excel, CSV 파일을 선택해 주세요.");
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error("파일은 각각 4 MB 이하로 첨부해 주세요.");
  if (file.name.length > 255) throw new Error("파일명은 255자 이하여야 합니다.");
  return { extension, mime };
}
