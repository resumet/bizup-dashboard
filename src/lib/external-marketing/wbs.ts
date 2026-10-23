import { toKoreaDate } from "@/lib/course-operations/schedule";
import { getWebinarDayDifference, sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";

export const externalMarketingMilestones = [
  { key: "advertising", label: "광고개시일", daysBefore: 21, basis: "웨비나 3주 전" },
  { key: "creative", label: "소재전달일", daysBefore: 28, basis: "웨비나 4주 전" },
  { key: "filming", label: "촬영일", daysBefore: 35, basis: "웨비나 5주 전" },
  { key: "planning", label: "기획서 전달일", daysBefore: 37, basis: "웨비나 5주 + 2일 전" },
] as const;

export const externalMarketingToday = () => toKoreaDate(new Date().toISOString());

function validWebinarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

const webinarMonthDayFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

const webinarFullDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export function formatExternalMarketingWebinarDate(value: string, includeYear = true) {
  const date = validWebinarDate(value);
  if (!date) return "날짜 미입력";
  return (includeYear ? webinarFullDateFormatter : webinarMonthDayFormatter).format(date);
}

export function formatExternalMarketingProjectTitle(title: string, webinarDate: string, advertisingStarted: boolean) {
  return `${advertisingStarted ? "🏃" : "🛑"} (${formatExternalMarketingWebinarDate(webinarDate, false)}) ${title}`;
}

export function externalMarketingWbs(webinarDate: string, today: string) {
  const webinar = validWebinarDate(webinarDate);
  return externalMarketingMilestones.map((milestone) => {
    const date = webinar ? new Date(webinar) : null;
    date?.setUTCDate(date.getUTCDate() - milestone.daysBefore);
    const dueDate = date?.toISOString().slice(0, 10) ?? "";
    return { ...milestone, dueDate, daysLeft: dueDate ? getWebinarDayDifference(dueDate, today) : null };
  });
}

export function formatWbsCountdown(days: number | null) {
  return days === null ? "미입력" : days === 0 ? "오늘" : days > 0 ? `${days}일 남음` : `${Math.abs(days)}일 지남`;
}

export function sortExternalMarketingProjects<T extends { webinarDate: string }>(projects: readonly T[], today = externalMarketingToday()) {
  return sortByNearestWebinar(projects.map((project) => ({ project, webinarAt: project.webinarDate })), today).map((item) => item.project);
}
