import type { CourseStatus } from "./course-status";

export const COURSE_LIST_COLLAPSIBLE_STATUS_ORDER = [
  "completed",
  "canceled",
  "on_hold",
] as const satisfies readonly Exclude<CourseStatus, "ongoing">[];

export const COURSE_LIST_INITIAL_OPEN_STATUSES = {
  completed: false,
  canceled: false,
  on_hold: false,
} as const;

export { getCourseNavigationItems as getCourseManagementDestinations } from "./course-menu";

export function formatCourseWbsProgress(
  overdueItemCount: number,
  totalItemCount: number,
) {
  return `일정 지남 ${overdueItemCount.toLocaleString("ko-KR")}개 / 전체 ${totalItemCount.toLocaleString("ko-KR")}개`;
}
