import type { CourseDocumentMaterial } from "./types";

const SEOUL_TIME_ZONE = "Asia/Seoul";

function dateParts(value: Date, timeZone = SEOUL_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function koreaDateKey(now = new Date()) {
  const { year, month, day } = dateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function webinarDeadlineDateKey(freeWebinarAt: string) {
  const webinar = new Date(freeWebinarAt);
  if (Number.isNaN(webinar.getTime())) return null;
  const { year, month, day } = dateParts(webinar);
  return utcDate(year, month, day).toISOString().slice(0, 10);
}

export function instagramUploadSchedule(freeWebinarAt: string, totalCount: number) {
  const deadlineDateKey = webinarDeadlineDateKey(freeWebinarAt);
  const normalizedTotalCount = Math.max(0, Math.trunc(totalCount));
  if (!deadlineDateKey || !normalizedTotalCount) return [];

  const dates = Array<string>(normalizedTotalCount);
  const cursor = new Date(`${deadlineDateKey}T00:00:00Z`);
  for (let index = normalizedTotalCount - 1; index >= 0; index -= 1) {
    dates[index] = cursor.toISOString().slice(0, 10);
    if (index === 0) continue;
    do {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  }
  return dates;
}

export function countWeekdaysInclusive(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00Z`);
  const end = new Date(`${endDateKey}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function instagramProgressSummary(
  materials: CourseDocumentMaterial[],
  freeWebinarAt: string,
  todayDateKey = koreaDateKey(),
) {
  const totalCount = materials.length;
  const planningCompletedCount = materials.filter((item) => item.planningCompleted).length;
  const filmingCompletedCount = materials.filter((item) => item.filmingCompleted).length;
  const uploadCompletedCount = materials.filter((item) => item.uploadCompleted).length;
  const remainingUploadCount = Math.max(totalCount - uploadCompletedCount, 0);
  const deadlineDateKey = webinarDeadlineDateKey(freeWebinarAt);
  const uploadSchedule = instagramUploadSchedule(freeWebinarAt, totalCount);
  const remainingWeekdays = deadlineDateKey
    ? uploadSchedule.filter((dateKey) => dateKey >= todayDateKey).length
    : null;
  const requiredUploadCount = remainingWeekdays === null
    ? null
    : Math.min(Math.max(totalCount - remainingWeekdays, 0), totalCount);
  const uploadShortfallCount = requiredUploadCount === null
    ? null
    : Math.max(requiredUploadCount - uploadCompletedCount, 0);
  return {
    totalCount,
    planningCompletedCount,
    filmingCompletedCount,
    uploadCompletedCount,
    remainingUploadCount,
    deadlineDateKey,
    remainingWeekdays,
    requiredUploadCount,
    uploadShortfallCount,
    isAtRisk: uploadShortfallCount !== null && uploadShortfallCount > 0,
  };
}

export function progressPercentage(completed: number, total: number) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}
