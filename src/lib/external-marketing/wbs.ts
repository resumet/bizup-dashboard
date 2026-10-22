import { toKoreaDate } from "@/lib/course-operations/schedule";
import { getWebinarDayDifference, sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";

export const externalMarketingMilestones = [
  { key: "advertising", label: "광고개시일", daysBefore: 21, basis: "웨비나 3주 전" },
  { key: "creative", label: "소재전달일", daysBefore: 28, basis: "웨비나 4주 전" },
  { key: "filming", label: "촬영일", daysBefore: 35, basis: "웨비나 5주 전" },
  { key: "planning", label: "기획서 전달일", daysBefore: 37, basis: "웨비나 5주 + 2일 전" },
] as const;

export const externalMarketingToday = () => toKoreaDate(new Date().toISOString());

export function externalMarketingWbs(webinarDate: string, today: string) {
  const webinar = /^\d{4}-\d{2}-\d{2}$/u.test(webinarDate) ? new Date(`${webinarDate}T00:00:00Z`) : null;
  const valid = webinar && !Number.isNaN(webinar.getTime()) && webinar.toISOString().slice(0, 10) === webinarDate;
  return externalMarketingMilestones.map((milestone) => {
    const date = valid ? new Date(webinar) : null;
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
