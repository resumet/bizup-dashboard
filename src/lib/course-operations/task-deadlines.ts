import type {
  CourseRequiredTask,
  CourseRequiredTaskKey,
} from "./types";

export const TASK_DEADLINE_WEEKS: Record<CourseRequiredTaskKey, number> = {
  "free-webinar-assets": 4,
  "paid-course-assets": 2,
  "course-materials": 1,
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function koreaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getTaskDeadlineDate(
  freeWebinarDate: string,
  taskKey: CourseRequiredTaskKey,
) {
  const webinar = parseDateOnly(freeWebinarDate);
  if (!webinar) return "";
  webinar.setUTCDate(
    webinar.getUTCDate() - TASK_DEADLINE_WEEKS[taskKey] * 7,
  );
  return webinar.toISOString().slice(0, 10);
}

export function applyTaskDeadlines(
  tasks: CourseRequiredTask[],
  freeWebinarDate: string,
) {
  return tasks.map((task) => ({
    ...task,
    dueDate: getTaskDeadlineDate(freeWebinarDate, task.key),
  }));
}

export function formatDeadlineDate(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export type DeadlineProgress = {
  label: string;
  state: "complete" | "upcoming" | "today" | "overdue" | "unscheduled";
};

export function getDeadlineProgress(
  dueDate: string,
  completed: boolean,
  today = koreaToday(),
): DeadlineProgress {
  if (completed) return { label: "작업 완료", state: "complete" };
  const due = parseDateOnly(dueDate);
  const current = parseDateOnly(today);
  if (!due || !current) {
    return { label: "일정 미정", state: "unscheduled" };
  }
  const days = Math.round((due.getTime() - current.getTime()) / DAY_MS);
  if (days > 0) {
    return { label: `D-${days} · ${days}일 남음`, state: "upcoming" };
  }
  if (days === 0) {
    return { label: "D-DAY · 오늘 마감", state: "today" };
  }
  return {
    label: `D+${Math.abs(days)} · ${Math.abs(days)}일 지남`,
    state: "overdue",
  };
}
