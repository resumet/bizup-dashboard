import type { WorkDailyReport, WorkTask } from "./types";

export function normalizeWorkSearch(value: string) {
  return value.trim().toLocaleLowerCase("ko");
}

export function workTaskMatches(task: WorkTask, assigneeName: string, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return `${task.title}\n${task.description}\n${assigneeName}`
    .toLocaleLowerCase("ko")
    .includes(normalizedQuery);
}

export function workReportMatches(report: WorkDailyReport | undefined, authorName: string, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return `${report?.content ?? ""}\n${authorName}`
    .toLocaleLowerCase("ko")
    .includes(normalizedQuery);
}
