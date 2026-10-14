import { normalizePhoneForStorage } from "@/lib/import/roster";
import { paidRosterStudents } from "@/lib/course-orders/paid-student-share";
import type { RosterRow } from "@/lib/jobs/types";

export type ContactCourse = { id: string; name: string; cohort: string | null; instructorName: string | null };

export function rosterIncludesContact(rows: RosterRow[], contactPhone: string) {
  const normalize = (value: string) => {
    if (/[a-z가-힣]/iu.test(value)) return "";
    const phone = normalizePhoneForStorage(value) ?? "";
    return /^0\d{8,10}$/u.test(phone) ? phone : "";
  };
  const phone = normalize(contactPhone);
  return Boolean(phone) && paidRosterStudents(rows).some(student => normalize(student.phone) === phone);
}
