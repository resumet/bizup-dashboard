import { normalizeOrderStudentPhone } from "@/lib/course-orders/student-roster";

export type LinkedStudentValues = {
  hasDifferentStudent?: boolean;
  studentName?: string;
  studentPhone?: string;
};

export function parseLinkedStudent(value: Record<string, unknown>): Required<LinkedStudentValues> {
  if (typeof value.hasDifferentStudent !== "boolean") throw new Error("결제자와 수강생이 다른지 확인해 주세요.");
  if (!value.hasDifferentStudent) return { hasDifferentStudent: false, studentName: "", studentPhone: "" };
  const studentName = typeof value.studentName === "string" ? value.studentName.trim() : "";
  if (!studentName || studentName.length > 120) throw new Error("실제 수강생 이름을 1~120자로 입력해 주세요.");
  const studentPhone = typeof value.studentPhone === "string" ? normalizeOrderStudentPhone(value.studentPhone) : "";
  if (!studentPhone) throw new Error("실제 수강생 전화번호를 010-0000-0000 형식으로 입력해 주세요.");
  return { hasDifferentStudent: true, studentName, studentPhone };
}

/** Keep payer identity for accounting/import matching; resolve recipients only at messaging boundaries. */
export function rosterRecipient(row: {
  normalizedPhone: string;
  values: { customerName: string } & LinkedStudentValues;
}) {
  if (row.values.hasDifferentStudent) {
    // Never fall back to the payer if an old or malformed linked record is incomplete.
    return {
      name: typeof row.values.studentName === "string" ? row.values.studentName.trim() : "",
      phone: typeof row.values.studentPhone === "string" ? normalizeOrderStudentPhone(row.values.studentPhone) : "",
    };
  }
  return { name: row.values.customerName, phone: row.normalizedPhone };
}
