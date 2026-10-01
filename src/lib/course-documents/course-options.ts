import { COURSE_COMPLETION_AFTER_DAYS } from "@/lib/course-operations/course-list-status";
import { getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";

import type { CourseDocumentCourse } from "./types";

export function activeInstagramCourses(
  courses: readonly CourseDocumentCourse[],
  todayKoreaDate: string,
) {
  return courses.filter((course) => {
    const days = getWebinarDayDifference(course.freeWebinarAt, todayKoreaDate);
    return days === null || days > -COURSE_COMPLETION_AFTER_DAYS;
  });
}

export function instagramCourseOptionLabel(course: CourseDocumentCourse) {
  const rawCohort = course.cohort.trim();
  const cohort = rawCohort ? rawCohort.endsWith("기") ? rawCohort : `${rawCohort}기` : "기수 미지정";
  const instructor = course.instructorName.trim() || "강사 미지정";
  const webinarDate = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(course.freeWebinarAt));
  return `${cohort} · ${course.name} · ${instructor} · ${webinarDate}`;
}
