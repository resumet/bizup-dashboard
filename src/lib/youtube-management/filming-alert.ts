import { toKoreaDate } from "@/lib/course-operations/schedule";
import { getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";
import {
  DEFAULT_YOUTUBE_FILMING_ALERT_WEEKS,
  type YoutubeFilmingAlertWeeks,
} from "./settings";

export const YOUTUBE_FILMING_ALERT_DAYS = DEFAULT_YOUTUBE_FILMING_ALERT_WEEKS * 7;

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
  filmingAlertWeeks: YoutubeFilmingAlertWeeks = DEFAULT_YOUTUBE_FILMING_ALERT_WEEKS,
): YoutubeFilmingAlert {
  const filmingAlertDays = filmingAlertWeeks * 7;
  const webinarDate = freeWebinarAt ? toKoreaDate(freeWebinarAt) : "";
  const daysUntilWebinar = freeWebinarAt
    ? getWebinarDayDifference(freeWebinarAt, todayKoreaDate)
    : null;
  const deadlineDate = webinarDate
    ? subtractCalendarDays(webinarDate, filmingAlertDays)
    : null;
  const deadlineReached =
    daysUntilWebinar !== null && daysUntilWebinar <= filmingAlertDays;
  const unconfirmedCount = appearances.filter(
    (appearance) =>
      appearance.request_status === "confirmed" &&
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
