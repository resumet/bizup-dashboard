import type { WorkTask } from "./types";

function koreaDateAt(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function taskAppearsOnWorkday(task: WorkTask, workDate: string) {
  if (task.planned_date > workDate || task.status === "cancelled") return false;
  if (task.status === "open") return true;
  return Boolean(task.completed_at && koreaDateAt(task.completed_at) === workDate);
}

export function isCarriedTask(task: WorkTask, workDate: string) {
  return task.status === "open" && task.planned_date < workDate;
}
