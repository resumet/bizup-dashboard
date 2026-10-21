export function refundDate(values: unknown): string | null {
  if (!values || typeof values !== "object") return null;
  const value = (values as Record<string, unknown>).refundedAt;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function refundFraction(values: unknown): "1/3" | "2/3" | null {
  if (!values || typeof values !== "object") return null;
  const value = (values as Record<string, unknown>).refundFraction;
  return value === "1/3" || value === "2/3" ? value : null;
}

export function refundAmount(values: unknown): number | null {
  if (!values || typeof values !== "object") return null;
  const value = (values as Record<string, unknown>).refundAmount;
  const amount = typeof value === "number" ? value : typeof value === "string" && /^\d{1,13}$/u.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
