import { normalizePhoneForStorage } from "@/lib/import/roster";
import { paidRosterStudents } from "@/lib/course-orders/paid-student-share";
import type { RosterRow } from "@/lib/jobs/types";

type Person = { names: string[]; emails: string[] };
export type PaidStudentComparison = {
  left: { rowCount: number; uniqueCount: number; invalidPhoneCount: number };
  right: { rowCount: number; uniqueCount: number; invalidPhoneCount: number };
  matches: { phone: string; left: Person; right: Person }[];
};
export type PaidStudentComparisonResponse = PaidStudentComparison & {
  leftRoster: { id: string; name: string };
  rightRoster: { id: string; name: string };
};

function groupStudents(rows: RosterRow[]) {
  const students = paidRosterStudents(rows);
  const people = new Map<string, { names: Set<string>; emails: Set<string> }>();
  let invalidPhoneCount = 0;
  for (const student of students) {
    const phone = normalizePhoneForStorage(student.phone) ?? "";
    if (!/^0\d{8,10}$/u.test(phone) || /[a-z가-힣]/iu.test(student.phone)) {
      invalidPhoneCount += 1;
      continue;
    }
    const person = people.get(phone) ?? { names: new Set<string>(), emails: new Set<string>() };
    if (student.name.trim()) person.names.add(student.name.trim());
    if (student.email.trim()) person.emails.add(student.email.trim());
    people.set(phone, person);
  }
  return { people, summary: { rowCount: students.length, uniqueCount: people.size, invalidPhoneCount } };
}

export function comparePaidStudents(leftRows: RosterRow[], rightRows: RosterRow[]): PaidStudentComparison {
  const left = groupStudents(leftRows), right = groupStudents(rightRows);
  const matches: PaidStudentComparison["matches"] = [];
  for (const [phone, person] of left.people) {
    const other = right.people.get(phone);
    if (other) matches.push({
      phone,
      left: { names: [...person.names], emails: [...person.emails] },
      right: { names: [...other.names], emails: [...other.emails] },
    });
  }
  matches.sort((a, b) => a.phone.localeCompare(b.phone));
  return { left: left.summary, right: right.summary, matches };
}
