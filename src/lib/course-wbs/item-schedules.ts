import type { WbsCourse, WbsScheduleEntry, WbsScheduleItem } from "./types";

export type WbsItemSelection = Pick<WbsScheduleItem, "id" | "title">;

function normalizedTitle(title: string) {
  return title.trim().replace(/\s+/gu, " ");
}

export function schedulesForItem(courses: WbsCourse[], entries: WbsScheduleEntry[], selection: WbsItemSelection) {
  const entriesByCourse = new Map(entries.map((entry) => [entry.courseId, entry]));
  return courses.map((course) => {
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
