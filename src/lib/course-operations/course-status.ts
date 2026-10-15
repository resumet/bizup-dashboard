export const COURSE_STATUSES = [
  "ongoing",
  "on_hold",
  "completed",
  "canceled",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const DEFAULT_SELECTABLE_COURSE_STATUS: CourseStatus = "ongoing";

export function isSelectableCourse(course: { status?: string | null }) {
  // Older saved options may not have status; preserve their existing display.
  return !["on_hold", "completed", "canceled"].includes(course.status ?? "");
}

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  ongoing: "진행",
  on_hold: "보류",
  completed: "완료",
  canceled: "취소",
};

export function isCourseStatus(value: unknown): value is CourseStatus {
  return (
    typeof value === "string" &&
    (COURSE_STATUSES as readonly string[]).includes(value)
  );
}
