import { z } from "zod";
import { attachmentType, entrySchema, MAX_AMOUNT } from "./model";

export const receiptExtractionSchema = z.object({
  status: z.enum(["approved", "canceled", "unknown"]),
  transactionCount: z.number().int().min(0),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  merchantName: z.string().nullable(),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  day: z.number().int().nullable(),
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
export type ReceiptAnalysis = {
  kind: "expense";
  amount: number;
  entryDate: string;
  partyName: string;
  yearInferred: boolean;
};

export function receiptImageType(file: { name: string; type: string; size: number }) {
  const format = attachmentType(file);
  if (!format.mime.startsWith("image/")) throw new Error("카드 승인 내역이 보이는 PNG, JPG, WEBP, GIF 이미지를 선택해 주세요.");
  return format;
}

export function normalizePartyName(name: string) {
  return name.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

export function receiptAnalysis(input: ReceiptExtraction, now = new Date()): ReceiptAnalysis {
  if (input.status === "canceled") throw new Error("승인 취소 내역입니다. 지출로 자동 입력할 수 없습니다.");
  if (input.transactionCount > 1) throw new Error("카드 승인 내역이 여러 건입니다. 한 건만 보이도록 잘라서 붙여넣어 주세요.");
  if (input.status !== "approved" || input.transactionCount !== 1) throw new Error("카드 승인 내역을 찾지 못했습니다. 승인 금액, 날짜, 가맹점명이 보이는 이미지를 붙여넣어 주세요.");
  if (input.currency !== "KRW") throw new Error("원화 승인 금액만 자동 입력할 수 있습니다. 통화와 금액을 직접 확인해 주세요.");
  if (input.amount === null || !Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > MAX_AMOUNT) throw new Error("승인 금액을 정확히 읽지 못했습니다. 더 선명한 이미지를 붙여넣어 주세요.");
  const partyName = input.merchantName?.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!partyName || partyName.length > 120) throw new Error("지급대상 가맹점명을 정확히 읽지 못했습니다. 더 선명한 이미지를 붙여넣어 주세요.");
  const year = input.year ?? Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));
  const entryDate = `${year}-${String(input.month).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`;
  if (!entrySchema.shape.entryDate.safeParse(entryDate).success) throw new Error("승인 날짜를 정확히 읽지 못했습니다. 날짜가 보이는 이미지를 붙여넣어 주세요.");
  return { kind: "expense", amount: input.amount, entryDate, partyName, yearInferred: input.year === null };
}
