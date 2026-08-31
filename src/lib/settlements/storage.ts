import type { SettlementRow } from "./analysis";

export const MAX_SETTLEMENT_REPORT_ROWS = 50_000;

const STRING_KEYS = [
  "platform",
  "settlementMonth",
  "settlementDate",
  "course",
  "instructor",
  "cohort",
  "orderNumber",
  "memberName",
  "email",
  "paymentDate",
  "installment",
  "pgFeeRate",
  "novaFeeRate",
  "paymentMethod",
  "orderStatus",
  "salesDate",
] as const satisfies ReadonlyArray<keyof SettlementRow>;

const NUMBER_KEYS = [
  "paymentAmount",
  "salesAmount",
  "pgFee",
  "novaFee",
  "settlementAmount",
] as const satisfies ReadonlyArray<keyof SettlementRow>;

export type SettlementReportSummary = {
  id: string;
  name: string;
  original_filename: string;
  row_count: number;
  created_at: string;
  updated_at: string;
};

export function parseStoredSettlementRows(value: unknown): SettlementRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("저장할 정산 데이터가 없습니다.");
  }
  if (value.length > MAX_SETTLEMENT_REPORT_ROWS) {
    throw new Error(
      `정산 데이터는 최대 ${MAX_SETTLEMENT_REPORT_ROWS.toLocaleString("ko-KR")}행까지 저장할 수 있습니다.`,
    );
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${index + 1}번째 정산 데이터 형식이 올바르지 않습니다.`);
    }
    const record = item as Record<string, unknown>;
    const row: Record<string, string | number> = {};
    for (const key of STRING_KEYS) {
      if (typeof record[key] !== "string") {
        throw new Error(`${index + 1}번째 정산 데이터의 ${key} 값이 올바르지 않습니다.`);
      }
      row[key] = record[key];
    }
    for (const key of NUMBER_KEYS) {
      if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
        throw new Error(`${index + 1}번째 정산 데이터의 ${key} 값이 올바르지 않습니다.`);
      }
      row[key] = record[key];
    }
    return row as SettlementRow;
  });
}
