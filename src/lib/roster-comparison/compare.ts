import { mapHeaders, normalizePhoneForStorage } from "@/lib/import/roster";
import type { ComparisonContact, ComparisonKey, ComparisonPerson, RosterComparisonResult, RosterDuplicatesResult } from "./types";

const text = (value: unknown) => String(value ?? "").trim();

export function parseComparisonPayers(matrix: unknown[][], fileName: string, matchBy: ComparisonKey): ComparisonContact[] {
  const headerIndex = matrix.slice(0, 20).findIndex((row) => Boolean(mapHeaders(row.map(text))[matchBy]));
  if (headerIndex < 0) throw new Error(`${matchBy === "phone" ? "전화번호(연락처·휴대전화번호)" : "이메일"} 열을 찾지 못했습니다. 첫 20행 안에 열 제목이 있는 엑셀 또는 CSV를 사용해 주세요.`);
  const headers = matrix[headerIndex].map(text);
  const mapping = mapHeaders(headers);
  const get = (row: unknown[], field: "customerName" | "phone" | "email") => mapping[field] ? text(row[headers.indexOf(mapping[field])]) : "";
  const contacts = matrix.slice(headerIndex + 1).flatMap((row, index) => row.every((value) => !text(value)) ? [] : [{
    name: get(row, "customerName"), phone: get(row, "phone"), email: get(row, "email"),
    source: fileName, rowNumber: headerIndex + index + 2,
  }]);
  if (!contacts.length) throw new Error("결제자 파일에 비교할 데이터가 없습니다.");
  if (contacts.length > 50_000) throw new Error("결제자 명단은 최대 50,000행까지 비교할 수 있습니다.");
  return contacts;
}

function comparisonIdentity(contact: ComparisonContact, matchBy: ComparisonKey) {
  if (matchBy === "email") {
    const email = contact.email.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : "";
  }
  const phone = normalizePhoneForStorage(contact.phone) ?? "";
  return /^0\d{8,10}$/u.test(phone) && !/[a-z가-힣]/iu.test(contact.phone) ? phone : "";
}

function groupContacts(contacts: ComparisonContact[], matchBy: ComparisonKey) {
  const groups = new Map<string, ComparisonContact[]>();
  const invalid: ComparisonContact[] = [];
  for (const contact of contacts) {
    const key = comparisonIdentity(contact, matchBy);
    if (!key) { invalid.push(contact); continue; }
    const group = groups.get(key) ?? [];
    group.push(contact); groups.set(key, group);
  }
  const people = new Map<string, ComparisonPerson>();
  for (const [key, group] of groups) {
    const join = (field: "name" | "phone" | "email") => [...new Set(group.map((row) => row[field]).filter(Boolean))].join(" / ");
    people.set(key, {
      name: join("name"), phone: matchBy === "phone" ? key : join("phone"),
      email: matchBy === "email" ? key : join("email"),
      sources: [...new Set(group.map((row) => row.source))], rowCount: group.length,
    });
  }
  return { people, groups, invalid, duplicates: contacts.length - invalid.length - people.size };
}

export function findRosterDuplicates(contacts: ComparisonContact[], matchBy: ComparisonKey): RosterDuplicatesResult {
  const grouped = groupContacts(contacts, matchBy);
  const duplicates = [...grouped.people].filter(([, person]) => person.rowCount > 1).map(([key, person]) => ({
    ...person,
    sources: grouped.groups.get(key)!.map((row) => `${row.source} (원본 ${row.rowNumber}행)`),
  }));
  return { matchBy, duplicates, invalid: grouped.invalid, totalRows: contacts.length, uniqueCount: grouped.people.size, duplicateRows: grouped.duplicates };
}

export function compareRosters(payers: ComparisonContact[], students: ComparisonContact[], matchBy: ComparisonKey): RosterComparisonResult {
  const left = groupContacts(payers, matchBy);
  const right = groupContacts(students, matchBy);
  return {
    matchBy,
    payerOnly: [...left.people].filter(([key]) => !right.people.has(key)).map(([, person]) => person),
    studentOnly: [...right.people].filter(([key]) => !left.people.has(key)).map(([, person]) => person),
    invalidPayers: left.invalid, invalidStudents: right.invalid,
    payerRows: payers.length, studentRows: students.length,
    payerCount: left.people.size, studentCount: right.people.size,
    matchedCount: [...left.people.keys()].filter((key) => right.people.has(key)).length,
    payerDuplicateRows: left.duplicates, studentDuplicateRows: right.duplicates,
  };
}
