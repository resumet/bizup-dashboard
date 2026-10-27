import type { CourseStatus } from "./course-status";

export const COURSE_LIST_COLLAPSIBLE_STATUS_ORDER = [
  "completed",
  "canceled",
  "on_hold",
] as const satisfies readonly Exclude<CourseStatus, "ongoing">[];

export type CourseManagementDestination = {
  label: string;
  href: string;
};

export function getCourseManagementDestinations(
  courseId: string,
): CourseManagementDestination[] {
  const encodedCourseId = encodeURIComponent(courseId);
  return [
    {
      label: "강사 정보 받기",
      href: `/services/instructor-intakes?courseId=${encodedCourseId}`,
    },
    {
      label: "강사 인스타그램 / 유튜브 관리",
      href: `/services/content-management/${encodedCourseId}`,
    },
    {
      label: "웨비나 정보",
      href: `/services/webinar-information/${encodedCourseId}`,
    },
    {
      label: "수강생 관리 및 정산",
      href: `/services/course-operations/students-settlements/${encodedCourseId}`,
    },
    {
      label: "WBS 관리",
      href: `/services/course-wbs?courseId=${encodedCourseId}`,
    },
  ];
}

export function formatCourseWbsProgress(
  overdueItemCount: number,
  totalItemCount: number,
) {
  return `일정 지남 ${overdueItemCount.toLocaleString("ko-KR")}개 / 전체 ${totalItemCount.toLocaleString("ko-KR")}개`;
}
