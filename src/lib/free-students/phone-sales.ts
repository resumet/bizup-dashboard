import { formatPhoneSalesPhone, type PhoneSalesContact } from "@/lib/phone-sales/jobs";
import type { Applicant } from "./model";

function normalizeKoreanMobilePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return /^01\d\d{8}$/u.test(digits) ? digits : "";
}

export function freeStudentsPhoneSalesContacts(rows: Applicant[]): PhoneSalesContact[] {
  const contacts = new Map<string, PhoneSalesContact>();
  for (const row of rows) {
    const phone = normalizeKoreanMobilePhone(row.phone);
    if (!phone || contacts.has(phone)) continue;
    contacts.set(phone, {
      name: String(row.username ?? "").trim(),
      phone,
      email: "",
      sourceFiles: [],
    });
  }
  return Array.from(contacts.values()).sort((left, right) => left.name.localeCompare(right.name, "ko-KR"));
}

export function freeStudentsPhoneSalesCsv(rows: Applicant[]) {
  const contacts = freeStudentsPhoneSalesContacts(rows);
  const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[["이름", "전화번호"], ...contacts.map((contact) => [contact.name, formatPhoneSalesPhone(contact.phone)])]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
  return { contacts, csv };
}
