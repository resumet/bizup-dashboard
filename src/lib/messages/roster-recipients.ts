import type { RosterRow } from "@/lib/jobs/types";
import { rosterRecipient } from "@/lib/jobs/linked-student";
import { dedupeMessageRecipientsByPhone } from "./dispatch";

export function resolveRosterMessageTargets<T extends RosterRow>(rows: T[]): T[] {
  return dedupeMessageRecipientsByPhone(rows.map((row) => {
    const recipient = rosterRecipient(row);
    return {
      ...row,
      normalizedPhone: recipient.phone,
      values: { ...row.values, customerName: recipient.name, phone: recipient.phone,
        // A payer email is not the linked student's contact address.
        email: row.values.hasDifferentStudent ? "" : row.values.email },
    };
  }), (row) => row.normalizedPhone);
}
