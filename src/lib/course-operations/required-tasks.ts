import type {
  CourseRequiredTask,
  CourseRequiredTaskKey,
} from "./types";

export const COURSE_REQUIRED_TASKS: ReadonlyArray<
  Pick<CourseRequiredTask, "key" | "title">
> = [
  { key: "free-webinar-assets", title: "무료특강 배너 + 상페" },
  { key: "paid-course-assets", title: "유료특강 배너 + 상페 + 동영상" },
  { key: "course-materials", title: "교안" },
];

const TASK_KEYS = new Set<CourseRequiredTaskKey>(
  COURSE_REQUIRED_TASKS.map((task) => task.key),
);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isDateOnly(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
}

export function createDefaultRequiredTasks(): CourseRequiredTask[] {
  return COURSE_REQUIRED_TASKS.map((task) => ({
    ...task,
    dueDate: "",
    completed: false,
  }));
}

export function normalizeRequiredTasks(value: unknown): CourseRequiredTask[] {
  const submitted = new Map<CourseRequiredTaskKey, Record<string, unknown>>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (
        typeof record.key === "string" &&
        TASK_KEYS.has(record.key as CourseRequiredTaskKey)
      ) {
        submitted.set(record.key as CourseRequiredTaskKey, record);
      }
    }
  }

  return COURSE_REQUIRED_TASKS.map((task) => {
    const item = submitted.get(task.key);
    const dueDate = typeof item?.dueDate === "string" ? item.dueDate.trim() : "";
    if (dueDate && !isDateOnly(dueDate)) {
      throw new Error(`${task.title} 예정일 형식을 확인해 주세요.`);
    }
    return {
      ...task,
      dueDate,
      completed: item?.completed === true,
    };
  });
}
