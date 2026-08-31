import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

import { normalizePhoneForStorage } from "@/lib/import/roster";

export type AddressContact = { name: string; email: string; normalizedPhone: string };

function normalizeHeader(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[\s_()\-./]/g, ""); }
function findIndex(headers: string[], aliases: string[]) { const normalized = headers.map(normalizeHeader); return normalized.findIndex((header) => aliases.map(normalizeHeader).includes(header)); }

export async function parseAddressBookFile(bytes: Uint8Array, fileName: string) {
  let matrix: unknown[][];
  if (fileName.toLowerCase().endsWith(".xlsx")) matrix = await readSheet(Buffer.from(bytes));
  else if (fileName.toLowerCase().endsWith(".csv")) matrix = parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { bom: true, skip_empty_lines: true, trim: true });
  else throw new Error("CSV 또는 XLSX 파일만 업로드할 수 있습니다.");
  if (matrix.length < 2) throw new Error("헤더와 한 개 이상의 데이터 행이 필요합니다.");
  const headers = matrix[0].map((value) => String(value ?? "").trim());
  const nameIndex = findIndex(headers, ["이름", "회원명", "고객명", "신청자", "name"]);
  const phoneIndex = findIndex(headers, ["전화번호", "연락처", "휴대폰", "휴대전화", "휴대전화번호", "phone", "mobile"]);
  const emailIndex = findIndex(headers, ["이메일", "메일", "email"]);
  if (phoneIndex < 0) throw new Error("전화번호, 연락처 또는 휴대전화번호 컬럼을 찾을 수 없습니다.");
  const contacts: AddressContact[] = [];
  let skippedRows = 0;
  for (const row of matrix.slice(1)) {
    const phone = normalizePhoneForStorage(row[phoneIndex]);
    if (!phone) { skippedRows += 1; continue; }
    contacts.push({ normalizedPhone: phone, name: nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "", email: emailIndex >= 0 ? String(row[emailIndex] ?? "").trim() : "" });
  }
  const uniqueContacts = [...new Map(contacts.map((contact) => [contact.normalizedPhone, contact])).values()];
  return { contacts: uniqueContacts, totalRows: matrix.length - 1, skippedRows: skippedRows + contacts.length - uniqueContacts.length };
}
