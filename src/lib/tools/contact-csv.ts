import { parse } from "csv-parse/sync";

export type ExtractedContact = {
  name: string;
  email: string;
  phone: string;
};

function cellText(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function formatExtractedPhone(value: unknown) {
  const text = cellText(value);
  const digits = text.replace(/\D/gu, "");
  const normalized = /^10\d{8}$/u.test(digits) ? `0${digits}` : digits;

  return /^\d{11}$/u.test(normalized)
    ? normalized.replace(/^(\d{3})(\d{4})(\d{4})$/u, "$1-$2-$3")
    : text;
}

export function extractContactRows(table: unknown[][]) {
  const contacts = table.slice(1).flatMap((row) => {
    const contact: ExtractedContact = {
      name: cellText(row[0]),
      email: cellText(row[2]),
      phone: formatExtractedPhone(row[1]),
    };

    return contact.name || contact.email || contact.phone ? [contact] : [];
  });

  if (contacts.length === 0) {
    throw new Error("추출할 연락처 데이터가 없습니다.");
  }

  return contacts;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildContactCsv(contacts: ExtractedContact[]) {
  return `\uFEFF${[
    ["이름", "연락처", "이메일"],
    ...contacts.map((contact) => [contact.name, contact.phone, contact.email]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
}

export function parseClipboardTable(text: string) {
  if (!text.trim()) {
    throw new Error("엑셀에서 복사한 내용을 붙여넣어 주세요.");
  }

  const firstContentLine = text.split(/\r?\n/gu).find((line) => line.trim()) ?? "";
  const delimiter = firstContentLine.includes("\t") ? "\t" : ",";

  try {
    return parse(text, {
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_quotes: false,
    }) as unknown[][];
  } catch {
    throw new Error("붙여넣은 표의 행과 열 구조를 확인해 주세요.");
  }
}
