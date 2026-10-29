import type { RosterRow } from "./types";

function amount(value: unknown) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+(?:\.\d{1,2})?$/u.test(value.trim())
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function isPartialRefundRosterRow(row: Pick<RosterRow, "values">) {
  return row.values.partialRefunded === true || row.values.refundSource === "partial_refund";
}

export function partialRefundRosterAmounts(row: Pick<RosterRow, "values">) {
  const revenueAmount = amount(row.values.paymentAmount);
  const refundAmount = amount(row.values.refundAmount);
  const savedOriginalAmount = amount(row.values.originalPaymentAmount);
  return {
    originalAmount: savedOriginalAmount || revenueAmount + refundAmount,
    refundAmount,
    revenueAmount,
  };
}
