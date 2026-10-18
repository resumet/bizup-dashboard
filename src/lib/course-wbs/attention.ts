import type { WbsCourse, WbsItem, WbsScheduleEntry, WbsScheduleItem } from "./types";
import { applyTemplateToCourse, webinarDateFromTimestamp } from "./webinar-date";

export function wbsProgress(items: readonly WbsScheduleItem[], today: string) {
  const completed = items.filter((item) => item.completed).length;
  return {
    total: items.length,
    remaining: items.length - completed,
    completed,
    progress: items.length ? Math.round(completed / items.length * 100) : 0,
    overdue: items.filter((item) => !item.completed && Boolean(item.dueDate || item.startDate) && (item.dueDate || item.startDate) < today).length,
  };
}

export type AttentionCategory = "overdue" | "today" | "missing" | "active" | "undated" | "upcoming";
export const ATTENTION_LABELS: Record<AttentionCategory, string> = {
  overdue: "미진행", today: "오늘 마감", missing: "등록 누락", active: "진행 필요", undated: "일정 미정", upcoming: "7일 내 예정",
};
const PRIORITY: Record<AttentionCategory, number> = { overdue: 0, today: 1, missing: 2, active: 3, undated: 4, upcoming: 5 };
export type AttentionTask = { course: WbsCourse; item: WbsScheduleItem; category: AttentionCategory; reason: string };

export function buildWbsAttention(courses: WbsCourse[], entries: WbsScheduleEntry[], today: string, templateItems: WbsItem[] = []) {
  const entriesByCourse = new Map(entries.map((entry) => [entry.courseId, entry]));
  const activeCourses = courses.filter((course) => course.status === "ongoing");
  const tasks = activeCourses.flatMap((course) => (entriesByCourse.get(course.id)?.items ?? []).flatMap((item): AttentionTask[] => {
    if (item.completed) return [];
    const deadline = item.dueDate || item.startDate;
    let category: AttentionCategory;
    let reason: string;
    if (deadline && deadline < today) {
      category = "overdue";
      const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${deadline}T00:00:00Z`)) / 86_400_000);
      reason = `${item.dueDate ? "마감일" : "시작일"} ${days}일 경과`;
    } else if (deadline === today) {
      category = "today"; reason = item.dueDate ? "오늘까지 완료해야 합니다." : "오늘 시작해야 합니다.";
    } else if (item.startDate && item.startDate <= today) {
      category = "active"; reason = "시작일이 지났고 아직 완료되지 않았습니다.";
    } else if (!deadline) {
      category = "undated"; reason = "일정이 없어 누락 여부를 확인해야 합니다.";
    } else if ((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 <= 7
      || (item.startDate && (Date.parse(`${item.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 <= 7)) {
      category = "upcoming"; reason = "7일 안에 시작하거나 마감합니다.";
    } else return [];
    return [{ course, item, category, reason }];
  }));
  for (const course of activeCourses) {
    const saved = entriesByCourse.get(course.id)?.items;
    if (!saved?.length) continue;
    const ids = new Set(saved.map((item) => item.id));
    const titles = new Set(saved.map((item) => item.title.trim()));
    const expected = applyTemplateToCourse(templateItems, webinarDateFromTimestamp(course.webinarAt));
    for (const item of expected) {
      if (ids.has(item.id) || titles.has(item.title.trim())) continue;
      const expectedStart = item.startDate || item.dueDate;
      if (expectedStart && expectedStart <= today) tasks.push({ course, item, category: "missing", reason: `템플릿 시작 예정 ${expectedStart} · WBS에 항목이 없습니다. 항목 추가로 등록하세요.` });
    }
  }
  const courseOrder = new Map(courses.map((course, index) => [course.id, index]));
  tasks.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category]
    || (a.item.dueDate || a.item.startDate).localeCompare(b.item.dueDate || b.item.startDate)
    || (courseOrder.get(a.course.id) ?? 0) - (courseOrder.get(b.course.id) ?? 0)
    || a.item.id.localeCompare(b.item.id));
  return {
    tasks,
    missingWbs: activeCourses.filter((course) => !entriesByCourse.get(course.id)?.items.length),
    counts: Object.fromEntries(Object.keys(PRIORITY).map((key) => [key, tasks.filter((task) => task.category === key).length])) as Record<AttentionCategory, number>,
  };
}
