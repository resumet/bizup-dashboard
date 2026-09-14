export function refundDate(values: unknown): string | null {
  if (!values || typeof values !== "object") return null;
  const value = (values as Record<string, unknown>).refundedAt;
  return typeof value === "string" && value.length > 0 ? value : null;
}
