import type { WbsCourse, WbsDashboard, WbsItem } from "./types";
import { toKoreaDate } from "@/lib/course-operations/schedule";

export type WbsDashboardEntry = {
  courseId: string;
  items: WbsItem[];
};

function scheduledDate(item: WbsItem) {
  return item.dueDate || item.startDate;
}

const ATTENTION_TASK_LIMIT = 20;
const UPCOMING_TASK_DAYS = 7;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function buildWbsDashboard(
  entries: WbsDashboardEntry[],
  courses: WbsCourse[],
  now = new Date(),
): WbsDashboard {
  const today = toKoreaDate(now.toISOString());
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const incomplete = entries.flatMap((entry) => entry.items
    .filter((item) => !item.completed)
    .map((item) => ({
      courseId: entry.courseId,
      itemId: item.id,
      title: item.title,
      owner: item.owner,
      startDate: item.startDate,
      dueDate: item.dueDate,
      scheduledDate: scheduledDate(item),
      position: item.position,
      webinarAt: coursesById.get(entry.courseId)?.webinarAt ?? "",
    })));

  incomplete.sort((a, b) => {
    if (a.scheduledDate && !b.scheduledDate) return -1;
    if (!a.scheduledDate && b.scheduledDate) return 1;
    return a.scheduledDate.localeCompare(b.scheduledDate)
      || a.webinarAt.localeCompare(b.webinarAt)
      || a.position - b.position
      || a.title.localeCompare(b.title, "ko");
  });

  const unstartedCourseIds = new Set(entries
    .filter((entry) => entry.items.length > 0 && entry.items.every((item) => !item.completed))
    .map((entry) => entry.courseId));
  const closestUnstarted = courses
    .filter((course) => unstartedCourseIds.has(course.id) && course.webinarAt && new Date(course.webinarAt).getTime() >= now.getTime())
    .sort((a, b) => a.webinarAt!.localeCompare(b.webinarAt!) || a.id.localeCompare(b.id))[0];

  const allItems = entries.flatMap((entry) => entry.items);
  const datedIncomplete = incomplete.filter((task) => task.scheduledDate);
  const overdueTasks = datedIncomplete.filter((task) => task.scheduledDate < today).slice(0, ATTENTION_TASK_LIMIT);
  const upcomingTasks = datedIncomplete
    .filter((task) => {
      const days = daysBetween(today, task.scheduledDate);
      return days >= 0 && days <= UPCOMING_TASK_DAYS;
    })
    .slice(0, ATTENTION_TASK_LIMIT - overdueTasks.length);
  return {
    savedWbsCount: entries.length,
    totalItemCount: allItems.length,
    completedItemCount: allItems.filter((item) => item.completed).length,
    overdueTasks: overdueTasks.map((task) => ({
      courseId: task.courseId,
      itemId: task.itemId,
      title: task.title,
      owner: task.owner,
      startDate: task.startDate,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
    })),
    upcomingTasks: upcomingTasks.map((task) => ({
      courseId: task.courseId,
      itemId: task.itemId,
      title: task.title,
      owner: task.owner,
      startDate: task.startDate,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
    })),
    closestUnstartedCourseId: closestUnstarted?.id ?? null,
  };
}
