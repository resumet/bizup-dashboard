import type { ComparisonPerson } from "./types";

export function comparisonCsv(people: ComparisonPerson[]) {
  const records = [["이름", "전화번호", "이메일", "출처 명단", "원본 행 수"], ...people.map((person) => [
    person.name, person.phone.replace(/^(010)(\d{4})(\d{4})$/u, "$1-$2-$3"), person.email, person.sources.join(" / "), String(person.rowCount),
  ])];
  return "\uFEFF" + records.map((row) => row.map((value) => {
    const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}
