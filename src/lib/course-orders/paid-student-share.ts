import type { RosterRow } from "@/lib/jobs/types";
import { rosterRecipient } from "@/lib/jobs/linked-student";
import { refundDate } from "@/lib/jobs/refund";
import type { OrderStudent } from "./student-roster";

/** Public sharing reflects the saved roster, including manual edits and linked learners. */
export function paidRosterStudents(rows: RosterRow[]): OrderStudent[] {
  return rows.filter(row => !refundDate(row.values)).map(row => {
    const recipient = rosterRecipient(row);
    const amount = Number(row.values.paymentAmount ?? 0);
    return {
      orderId: row.id,
      name: recipient.name,
      phone: recipient.phone,
      // The payer's email does not belong to a linked learner.
      email: row.values.hasDifferentStudent ? "" : row.values.email ?? "",
      optionName: row.values.optionName ?? "",
      // Reuse the breakdown model for the saved roster's RS column.
      inflowType: row.values.rs ?? row.values.source ?? "",
      paymentMethod: row.values.paymentMethod ?? "",
      amount: Number.isFinite(amount) ? amount : 0,
      memo: row.memo,
      alternateStudentName: row.values.hasDifferentStudent ? recipient.name : "",
      alternateStudentPhone: row.values.hasDifferentStudent ? recipient.phone : "",
    };
  });
}
