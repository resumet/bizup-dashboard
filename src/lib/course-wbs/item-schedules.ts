import type { WbsCourse, WbsScheduleEntry, WbsScheduleItem } from "./types";
import { webinarDateFromTimestamp } from "./webinar-date";

export type WbsItemSelection = Pick<WbsScheduleItem, "id" | "title">;
export type WbsItemScheduleRow = {
  course: WbsCourse;
  hasWbs: boolean;
  item: WbsScheduleItem | undefined;
};

const DAY_MS = 86_400_000;

function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function shortDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${Number(match[2])}월 ${Number(match[3])}일` : "날짜 미정";
}

function normalizedTitle(title: string) {
  return title.trim().replace(/\s+/gu, " ");
}

export function schedulesForItem(
  courses: WbsCourse[],
  entries: WbsScheduleEntry[],
  selection: WbsItemSelection,
  today: string,
): WbsItemScheduleRow[] {
  const entriesByCourse = new Map(entries.map((entry) => [entry.courseId, entry]));
  return courses.filter((course) => {
    const webinarDate = webinarDateFromTimestamp(course.webinarAt);
    return course.status === "ongoing"
      && entriesByCourse.has(course.id)
      && (!webinarDate || webinarDate >= today);
  }).map((course) => {
    const entry = entriesByCourse.get(course.id);
    const sameId = entry?.items.find((item) => item.id === selection.id);
    const sameTitle = entry?.items.filter((item) => normalizedTitle(item.title) === normalizedTitle(selection.title)) ?? [];
    // Independently added tasks have different IDs; only use an unambiguous title match.
    const item = sameId ?? (sameTitle.length === 1 ? sameTitle[0] : undefined);
    return { course, hasWbs: Boolean(entry), item };
  }).sort((a, b) => {
    const left = a.item?.startDate || "";
    const right = b.item?.startDate || "";
    if (Boolean(left) !== Boolean(right)) return left ? -1 : 1;
    return left.localeCompare(right) || a.course.name.localeCompare(b.course.name, "ko");
  });
}

export function startDateTone(startDate: string, today: string): "overdue" | "soon" | null {
  const start = dateValue(startDate);
  const current = dateValue(today);
  if (start === null || current === null) return null;
  if (start <= current) return "overdue";
  return start - current <= DAY_MS * 5 ? "soon" : null;
}

export function scheduleRowsText(title: string, rows: WbsItemScheduleRow[]) {
  const lines = rows.map(({ course, item }, index) => [
    `${index + 1}. ${course.name}`,
    course.instructorName || "강사 미입력",
    shortDateLabel(webinarDateFromTimestamp(course.webinarAt)),
    item?.startDate ? shortDateLabel(item.startDate) : "시작일 미정",
  ].join("/"));
  return [title.trim(), "", ...lines].join("\n");
}
