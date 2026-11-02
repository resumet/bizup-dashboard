import { toKoreaDate } from "@/lib/course-operations/schedule";
import { getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";

export const YOUTUBE_FILMING_ALERT_DAYS = 35;

type FilmingScheduleAppearance = {
  request_status: string;
  filming_confirmed?: boolean | null;
  filming_date?: string | null;
};

export type YoutubeFilmingAlert = {
  alertCount: number;
  deadlineDate: string | null;
  deadlineReached: boolean;
  unconfirmedCount: number;
};

function subtractCalendarDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

export function getYoutubeFilmingAlert(
  freeWebinarAt: string | null | undefined,
  appearances: readonly FilmingScheduleAppearance[],
  todayKoreaDate = toKoreaDate(new Date().toISOString()),
): YoutubeFilmingAlert {
  const webinarDate = freeWebinarAt ? toKoreaDate(freeWebinarAt) : "";
  const daysUntilWebinar = freeWebinarAt
    ? getWebinarDayDifference(freeWebinarAt, todayKoreaDate)
    : null;
  const deadlineDate = webinarDate
    ? subtractCalendarDays(webinarDate, YOUTUBE_FILMING_ALERT_DAYS)
    : null;
  const deadlineReached =
    daysUntilWebinar !== null && daysUntilWebinar <= YOUTUBE_FILMING_ALERT_DAYS;
  const unconfirmedCount = appearances.filter(
    (appearance) =>
      appearance.request_status !== "declined" &&
      !(appearance.filming_confirmed === true && appearance.filming_date),
  ).length;

  return {
    alertCount: deadlineReached ? unconfirmedCount : 0,
    deadlineDate,
    deadlineReached,
    unconfirmedCount,
  };
}

export function formatYoutubeFilmingDeadline(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
