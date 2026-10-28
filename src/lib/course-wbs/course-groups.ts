import type { CourseStatus } from "@/lib/course-operations/course-status";

export function splitWbsCoursesByCompletion<T extends { course: { status: CourseStatus } }>(entries: readonly T[]) {
  return {
    current: entries.filter(({ course }) => course.status !== "completed"),
    completed: entries.filter(({ course }) => course.status === "completed"),
  };
}
