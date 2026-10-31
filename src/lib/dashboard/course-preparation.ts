import { buildWbsAttention, wbsProgress, type AttentionCategory } from "@/lib/course-wbs/attention";
import type { WbsCourse, WbsItem, WbsScheduleEntry, WbsScheduleItem } from "@/lib/course-wbs/types";

export type CoursePreparationStatus = "danger" | "warning" | "normal" | "complete";

export type CoursePreparationNextTask = {
  id: string;
  title: string;
  owner: string;
  scheduledDate: string;
  category: AttentionCategory | "planned";
  reason: string;
};

export type CoursePreparationSummary = {
  id: string;
  name: string;
  instructorName: string;
  cohort: string;
  webinarAt: string | null;
  totalCount: number;
  completedCount: number;
  progress: number;
  overdueCount: number;
  todayCount: number;
  missingCount: number;
  activeCount: number;
  undatedCount: number;
  upcomingCount: number;
  wbsMissing: boolean;
  status: CoursePreparationStatus;
  nextTask: CoursePreparationNextTask | null;
};

const STATUS_PRIORITY: Record<CoursePreparationStatus, number> = {
  danger: 0,
  warning: 1,
  normal: 2,
  complete: 3,
};

function scheduledDate(item: WbsScheduleItem) {
  return item.dueDate || item.startDate;
}

function findNextPlannedTask(items: readonly WbsScheduleItem[]): CoursePreparationNextTask | null {
  const next = items
    .map((item, index) => ({ item, index, scheduledDate: scheduledDate(item) }))
    .filter(({ item }) => !item.completed)
    .sort((left, right) => {
      if (!left.scheduledDate && right.scheduledDate) return 1;
      if (left.scheduledDate && !right.scheduledDate) return -1;
      return left.scheduledDate.localeCompare(right.scheduledDate) || left.index - right.index;
    })[0];

  if (!next) return null;
  return {
    id: next.item.id,
    title: next.item.title,
    owner: next.item.owner,
    scheduledDate: next.scheduledDate,
    category: "planned",
    reason: next.scheduledDate ? "다음 예정 업무" : "일정 등록 필요",
  };
}

export function buildDashboardCoursePreparation(
  courses: WbsCourse[],
  entries: WbsScheduleEntry[],
  templateItems: WbsItem[],
  today: string,
): CoursePreparationSummary[] {
  const attention = buildWbsAttention(courses, entries, today, templateItems);
  const entriesByCourse = new Map(entries.map((entry) => [entry.courseId, entry]));
  const attentionByCourse = new Map<string, typeof attention.tasks>();

  for (const task of attention.tasks) {
    const courseTasks = attentionByCourse.get(task.course.id) ?? [];
    courseTasks.push(task);
    attentionByCourse.set(task.course.id, courseTasks);
  }

  return courses
    .filter((course) => course.status === "ongoing")
    .map((course, courseOrder) => {
      const items = entriesByCourse.get(course.id)?.items ?? [];
      const progress = wbsProgress(items, today);
      const tasks = attentionByCourse.get(course.id) ?? [];
      const count = (category: AttentionCategory) => tasks.filter((task) => task.category === category).length;
      const overdueCount = count("overdue");
      const todayCount = count("today");
      const missingCount = count("missing");
      const activeCount = count("active");
      const undatedCount = count("undated");
      const upcomingCount = count("upcoming");
      const wbsMissing = items.length === 0;

      let status: CoursePreparationStatus = "normal";
      if (wbsMissing || overdueCount > 0 || missingCount > 0) status = "danger";
      else if (progress.total > 0 && progress.completed === progress.total) status = "complete";
      else if (todayCount > 0 || activeCount > 0 || undatedCount > 0) status = "warning";

      const attentionTask = tasks[0];
      const nextTask = attentionTask
        ? {
            id: attentionTask.item.id,
            title: attentionTask.item.title,
            owner: attentionTask.item.owner,
            scheduledDate: scheduledDate(attentionTask.item),
            category: attentionTask.category,
            reason: attentionTask.reason,
          }
        : findNextPlannedTask(items);

      return {
        id: course.id,
        name: course.name,
        instructorName: course.instructorName,
        cohort: course.cohort,
        webinarAt: course.webinarAt,
        totalCount: progress.total,
        completedCount: progress.completed,
        progress: progress.progress,
        overdueCount,
        todayCount,
        missingCount,
        activeCount,
        undatedCount,
        upcomingCount,
        wbsMissing,
        status,
        nextTask,
        courseOrder,
      };
    })
    .sort((left, right) => STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] || left.courseOrder - right.courseOrder)
    .map(({ courseOrder, ...course }) => {
      void courseOrder;
      return course;
    });
}
