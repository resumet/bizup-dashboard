export function courseWebinarDateInKorea(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isPaymentBeforeWebinar(paymentDate: string | null | undefined, webinarDate: string | null | undefined) {
  return Boolean(paymentDate && webinarDate && paymentDate < webinarDate);
}
