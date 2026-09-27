const DAY_MS = 24 * 60 * 60 * 1000;

type StartOffset = { label: string; daysBefore: number };

export const WBS_START_OFFSETS: readonly StartOffset[] = [
  ...Array.from({ length: 12 }, (_, index) => {
    const weeksBefore = 12 - index;
    return { label: `${weeksBefore}주 전`, daysBefore: weeksBefore * 7 };
  }),
  ...Array.from({ length: 6 }, (_, index) => {
    const daysBefore = 6 - index;
    return { label: `${daysBefore}일 전`, daysBefore };
  }),
];

export const WBS_DUE_OFFSETS = [
  { label: "시작일 당일", daysAfter: 0 },
  ...Array.from({ length: 7 }, (_, index) => ({ label: `시작일 +${index + 1}일`, daysAfter: index + 1 })),
] as const;

function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function formatDate(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toISOString().slice(0, 10);
  return dateValue(formatted) === timestamp ? formatted : null;
}

export function dueDateForOffset(startDate: string, daysAfter: number): string {
  const start = dateValue(startDate);
  if (start === null || !Number.isInteger(daysAfter) || daysAfter < 0 || daysAfter > 7) return "";
  return formatDate(start + daysAfter * DAY_MS) ?? "";
}

export function dueDateForStartDate(startDate: string, webinarDate: string): string {
  const start = dateValue(startDate);
  if (start === null) return "";

  const webinar = dateValue(webinarDate);
  const daysBefore = webinar === null ? null : (webinar - start) / DAY_MS;
  if (daysBefore !== null && daysBefore >= 1 && daysBefore <= 6) return startDate;

  return formatDate(start + DAY_MS) ?? "";
}

export function datesForStartOffset(
  webinarDate: string,
  daysBefore: number,
): { startDate: string; dueDate: string } | null {
  const webinar = dateValue(webinarDate);
  if (webinar === null || !Number.isInteger(daysBefore) || daysBefore < 1) return null;

  const startDate = formatDate(webinar - daysBefore * DAY_MS);
  if (startDate === null) return null;
  const dueDate = dueDateForStartDate(startDate, webinarDate);
  return dueDate ? { startDate, dueDate } : null;
}
