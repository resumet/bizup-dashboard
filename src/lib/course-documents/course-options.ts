import { isSelectableCourse } from "@/lib/course-operations/course-status";
import { COURSE_COMPLETION_AFTER_DAYS } from "@/lib/course-operations/course-list-status";
import { formatWebinarDate, getWebinarDayDifference, sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";

import type { CourseDocumentCourse } from "./types";

export function activeInstagramCourses(
  courses: readonly CourseDocumentCourse[],
  todayKoreaDate: string,
) {
  return sortByNearestWebinar(courses.filter(isSelectableCourse).filter((course) => {
    const days = getWebinarDayDifference(course.freeWebinarAt, todayKoreaDate);
    return days === null || days > -COURSE_COMPLETION_AFTER_DAYS;
  }), todayKoreaDate);
}

export function instagramCourseDetails(course: CourseDocumentCourse) {
  const rawCohort = course.cohort.trim();
  const cohort = rawCohort ? rawCohort.endsWith("기") ? rawCohort : `${rawCohort}기` : "기수 미지정";
  const instructor = course.instructorName.trim() || "강사 미지정";
  const webinarDate = course.freeWebinarAt ? formatWebinarDate(course.freeWebinarAt) : "웨비나 미정";
  return [cohort, instructor, webinarDate];
}

export function instagramCourseOptionLabel(course: CourseDocumentCourse) {
  const [cohort, instructor, webinarDate] = instagramCourseDetails(course);
  return `${cohort} · ${course.name} · ${instructor} · ${webinarDate}`;
}
