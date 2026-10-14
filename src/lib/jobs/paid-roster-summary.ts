import type { RosterRow } from "./types";
import { isCashPaymentMethod } from "@/lib/course-orders/student-roster";

export type PaidRosterSummary = {
  payerCount: number;
  cashPayerCount: number;
  paymentAmount: number;
  options: Array<{ optionName: string; payerCount: number }>;
};

function payerKey(row: RosterRow) {
  const phone = row.normalizedPhone.replace(/\D/gu, "");
  if (phone) return `phone:${phone}`;

  const email = row.values.email.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  if (email) return `email:${email}`;

  // A contact-less row still represents one saved payer and must not disappear.
  return `row:${row.id}`;
}

export function summarizePaidRoster(rows: RosterRow[]): PaidRosterSummary {
  const payers = new Set<string>();
  const cashPayers = new Set<string>();
  const optionPayers = new Map<string, Set<string>>();
  let paymentCents = 0;

  for (const row of rows) {
    const payer = payerKey(row);
    const optionName = row.values.optionName.trim() || "옵션 없음";
    const amount = Number(row.values.paymentAmount);

    payers.add(payer);
    if (isCashPaymentMethod(row.values.paymentMethod)) cashPayers.add(payer);
    paymentCents += Number.isFinite(amount) ? Math.round(amount * 100) : 0;

    const option = optionPayers.get(optionName) ?? new Set<string>();
    option.add(payer);
    optionPayers.set(optionName, option);
  }

  return {
    payerCount: payers.size,
    cashPayerCount: cashPayers.size,
    paymentAmount: paymentCents / 100,
    options: [...optionPayers]
      .map(([optionName, option]) => ({
        optionName,
        payerCount: option.size,
      }))
      .sort(
        (left, right) =>
          right.payerCount - left.payerCount ||
          left.optionName.localeCompare(right.optionName, "ko-KR"),
      ),
  };
}
