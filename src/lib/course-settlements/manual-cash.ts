import type { RosterRow } from "@/lib/jobs/types";
import { refundDate } from "@/lib/jobs/refund";
import { parsePaymentAmount } from "@/lib/jobs/payment-fields";
import { normalizeOrderStudentPhone } from "@/lib/course-orders/student-roster";

export type ManualCashSummary = { payerCount: number; paymentCount: number; amount: number };

export function summarizeManualCash(rows: RosterRow[]): ManualCashSummary {
  const payers = new Set<string>();
  let cents = 0;
  let paymentCount = 0;
  for (const row of rows) {
    // Only manual cash is additional revenue; imported payments already belong to the workbook.
    if (!row.isManuallyAdded || row.isExtraParticipant || refundDate(row.values)
      || row.values.paymentMethod?.normalize("NFKC").trim() !== "현금결제") continue;
    let amount: string;
    try { amount = parsePaymentAmount(row.values.paymentAmount ?? ""); }
    catch { throw new Error("현금결제 수강생의 결제금액을 확인해 주세요."); }
    if (!amount || Number(amount) === 0) continue;
    const phone = normalizeOrderStudentPhone(row.normalizedPhone || row.values.phone);
    const email = row.values.email.normalize("NFKC").trim().toLowerCase();
    payers.add(phone ? `phone:${phone}` : email ? `email:${email}` : `row:${row.id}`);
    cents += Math.round(Number(amount) * 100);
    paymentCount += 1;
  }
  return { payerCount: payers.size, paymentCount, amount: cents / 100 };
}
