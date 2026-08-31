import { createHash } from "node:crypto";

import { parse } from "csv-parse/sync";
import { readSheet, type SheetData } from "read-excel-file/node";

import { STANDARD_FIELDS, type ImportPreview, type StandardField } from "./contract";

export type StoredRosterRecord = {
  sourceRowNumber: number;
  normalizedPhone: string;
  normalizedValues: Record<StandardField, string> & {
    groupChatJoined?: boolean;
  };
  originalValues: Record<string, string>;
  isDuplicate: boolean;
};

export type RosterAnalysis = {
  preview: ImportPreview;
  records: StoredRosterRecord[];
};

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const HEADER_ALIASES: Record<StandardField, string[]> = {
  courseName: ["강의명", "강좌명", "과정명"],
  optionName: ["옵션명", "옵션", "상품옵션"],
  customerName: ["이름", "고객명", "성명", "신청자명"],
  email: ["이메일", "email", "메일"],
  phone: [
    "연락처",
    "휴대전화번호",
    "전화번호",
    "휴대폰번호",
    "휴대폰",
    "휴대전화",
    "핸드폰",
  ],
  referrer: ["추천인", "rs추천인"],
  source: ["유입경로", "신청경로", "유입채널"],
  adMedia: ["광고매체", "매체", "광고채널"],
};

function normalizeHeader(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s_()\[\]{}\-./]/g, "");
}

export function mapHeaders(headers: string[]): Partial<Record<StandardField, string>> {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  return Object.fromEntries(
    STANDARD_FIELDS.flatMap((field) => {
      const aliases = HEADER_ALIASES[field].map(normalizeHeader);
      const matched = normalizedHeaders.find(({ normalized }) =>
        aliases.some((alias) => normalized === alias || (field === "referrer" && normalized.startsWith(alias))),
      );
      return matched ? [[field, matched.header]] : [];
    }),
  );
}

export function normalizePhone(value: unknown): string | null {
  const digits = normalizePhoneForStorage(value);
  return digits && /^010\d{8}$/.test(digits) ? digits : null;
}

export function normalizePhoneForStorage(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0082")) digits = digits.slice(4);
  else if (digits.startsWith("82")) digits = digits.slice(2);
  if (digits.startsWith("10")) digits = `0${digits}`;
  return digits || null;
}

function cleanValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "-" ? "" : text;
}

export function analyzeRosterCsv(bytes: Uint8Array, fileName: string): RosterAnalysis {
  if (bytes.byteLength === 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error("파일은 20MB 이하여야 합니다.");
  if (!fileName.toLowerCase().endsWith(".csv")) throw new Error("현재는 UTF-8 CSV 파일만 지원합니다.");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("CSV를 UTF-8로 저장한 뒤 다시 업로드해 주세요.");
  }

  let headers: string[] = [];
  let rows: Record<string, string>[];
  try {
    rows = parse(text, {
      bom: true,
      columns: (values: string[]) => {
        headers = values.map((value) => value.trim());
        return headers;
      },
      skip_empty_lines: true,
      relax_quotes: false,
      trim: true,
    });
  } catch {
    throw new Error("CSV 행과 열 구조를 확인해 주세요. 따옴표나 쉼표가 올바르지 않습니다.");
  }

  if (headers.length === 0 || rows.length === 0) throw new Error("헤더와 데이터 행이 필요합니다.");
  const mapping = mapHeaders(headers);
  if (!mapping.phone) throw new Error("필수 전화번호 컬럼을 찾지 못했습니다. '연락처', '휴대전화번호', '전화번호', '휴대폰번호' 중 하나의 헤더가 필요합니다.");

  const errors: ImportPreview["errors"] = [];
  const normalizedPhones: string[] = [];
  const normalizedRows = rows.map((row, index) => {
    const originalPhone = cleanValue(row[mapping.phone!]);
    const phone = normalizePhoneForStorage(originalPhone);
    if (!originalPhone) errors.push({ rowNumber: index + 2, code: "MISSING_PHONE", reason: "전화번호가 없습니다.", originalValue: "" });
    else if (!phone) errors.push({ rowNumber: index + 2, code: "MISSING_PHONE", reason: "전화번호에서 숫자를 찾을 수 없습니다.", originalValue: originalPhone });
    if (phone) normalizedPhones.push(phone);

    return Object.fromEntries(STANDARD_FIELDS.map((field) => [field, field === "phone" ? phone ?? "" : cleanValue(mapping[field] ? row[mapping[field]!] : "")])) as Record<StandardField, string>;
  });

  const phoneCounts = new Map<string, number>();
  normalizedPhones.forEach((phone) => phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1));
  const duplicateCounts = [...phoneCounts.values()].filter((count) => count > 1);

  const preview: ImportPreview = {
    file: { name: fileName, size: bytes.byteLength, checksumSha256: createHash("sha256").update(bytes).digest("hex") },
    headers,
    mapping,
    summary: {
      totalRows: rows.length,
      validRows: rows.length - errors.length,
      errorRows: errors.length,
      duplicateGroups: duplicateCounts.length,
      duplicateRows: duplicateCounts.reduce((sum, count) => sum + count, 0),
    },
    errors: errors.slice(0, 20),
    preview: normalizedRows.slice(0, 5),
  };

  const records = normalizedRows.flatMap((normalizedValues, index) => {
    if (!normalizedValues.phone) return [];
    return [{
      sourceRowNumber: index + 2,
      normalizedPhone: normalizedValues.phone,
      normalizedValues,
      originalValues: rows[index],
      isDuplicate: (phoneCounts.get(normalizedValues.phone) ?? 0) > 1,
    } satisfies StoredRosterRecord];
  });

  return { preview, records };
}

export function parseRosterCsv(bytes: Uint8Array, fileName: string): ImportPreview {
  return analyzeRosterCsv(bytes, fileName).preview;
}

function toCsvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function analyzeRosterFile(
  bytes: Uint8Array,
  fileName: string,
): Promise<RosterAnalysis> {
  if (bytes.byteLength === 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  if (bytes.byteLength > MAX_IMPORT_BYTES)
    throw new Error("파일은 20MB 이하여야 합니다.");
  if (fileName.toLowerCase().endsWith(".csv"))
    return analyzeRosterCsv(bytes, fileName);
  if (!fileName.toLowerCase().endsWith(".xlsx"))
    throw new Error("UTF-8 CSV 또는 XLSX 파일만 지원합니다.");

  let sheet: SheetData;
  try {
    sheet = await readSheet(Buffer.from(bytes));
  } catch {
    throw new Error("XLSX 파일을 읽지 못했습니다. 파일 형식을 확인해 주세요.");
  }
  const csvText = sheet
    .map((row) => row.map(toCsvCell).join(","))
    .join("\n");
  const analysis = analyzeRosterCsv(
    new TextEncoder().encode(csvText),
    `${fileName}.csv`,
  );
  analysis.preview.file = {
    name: fileName,
    size: bytes.byteLength,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return analysis;
}

export function rosterFileContentType(fileName: string) {
  return fileName.toLowerCase().endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
}
