import { toKoreaDate } from "./schedule";

const DAY_MS = 24 * 60 * 60 * 1_000;

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function getWebinarDayDifference(
  freeWebinarAt: string,
  todayKoreaDate: string,
) {
  const webinar = parseDateOnly(toKoreaDate(freeWebinarAt));
  const today = parseDateOnly(todayKoreaDate);
  if (!webinar || !today) return null;
  return Math.round((webinar.getTime() - today.getTime()) / DAY_MS);
}

export function formatWebinarCountdown(
  freeWebinarAt: string,
  todayKoreaDate: string,
) {
  const days = getWebinarDayDifference(freeWebinarAt, todayKoreaDate);
  if (days === null) return "";
  if (days > 0) return `(D-${days}일)`;
  if (days === 0) return "(D-Day)";
  return `(D+${Math.abs(days)}일)`;
}

export function sortByNearestWebinar<
  T extends { free_webinar_at: string },
>(courses: readonly T[], todayKoreaDate: string) {
  return courses
    .map((course, index) => ({
      course,
      index,
      days: getWebinarDayDifference(course.free_webinar_at, todayKoreaDate),
    }))
    .sort((left, right) => {
      if (left.days === null) return right.days === null ? left.index - right.index : 1;
      if (right.days === null) return -1;

      const leftIsPast = left.days < 0;
      const rightIsPast = right.days < 0;
      if (leftIsPast !== rightIsPast) return leftIsPast ? 1 : -1;

      const distanceOrder = Math.abs(left.days) - Math.abs(right.days);
      return distanceOrder || left.index - right.index;
    })
    .map(({ course }) => course);
}

export function sortByFarthestWebinar<T extends { free_webinar_at: string }>(
  courses: readonly T[],
) {
  return courses
    .map((course, index) => ({ course, index, time: Date.parse(course.free_webinar_at) }))
    .sort((left, right) => {
      const leftInvalid = Number.isNaN(left.time);
      const rightInvalid = Number.isNaN(right.time);
      if (leftInvalid || rightInvalid) {
        return leftInvalid === rightInvalid ? left.index - right.index : leftInvalid ? 1 : -1;
      }
      return right.time - left.time || left.index - right.index;
    })
    .map(({ course }) => course);
}
