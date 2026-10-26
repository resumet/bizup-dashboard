export function formatDashboardWebinarDate(value: string | null | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return "—";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}년 ${part("month")}월 ${part("day")}일(${part("weekday")})`;
}

export function formatDashboardCohort(value: string | null | undefined) {
  const cohort = value?.trim() ?? "";
  if (!cohort) return "기수 미정";
  return cohort.endsWith("기") ? cohort : `${cohort}기`;
}
