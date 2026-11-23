export const COURSE_MENU_ITEMS = [
  { kind: "detail", label: "강의 상세보기" },
  { kind: "intake", label: "강사 정보 받기" },
  { kind: "instagram", label: "강사 인스타그램 관리" },
  { kind: "youtube", label: "강사 출연 유튜브 관리" },
  { kind: "internal-youtube", label: "자체 유튜브 관리" },
  { kind: "webinar", label: "웨비나 정보" },
  { kind: "free-students", label: "무료수강생 관리" },
  { kind: "students", label: "수강생 관리 및 정산" },
  { kind: "wbs", label: "강의별 해야할일" },
  { kind: "ads", label: "광고성과 관리" },
  { kind: "status", label: "상태 변경" },
  { kind: "delete", label: "삭제" },
] as const;
export type CourseMenuKind = typeof COURSE_MENU_ITEMS[number]["kind"];
export type CourseNavigationKind = Exclude<CourseMenuKind, "status" | "delete">;

export function getCourseMenuItems(courseId: string) {
  const id = encodeURIComponent(courseId);
  const paths: Record<CourseNavigationKind, string> = {
    detail: `/services/course-operations/${id}`,
    intake: `/services/instructor-intakes?courseId=${id}`,
    instagram: `/services/instagram-management/${id}`,
    youtube: `/services/youtube-management/${id}`,
    "internal-youtube": `/services/internal-youtube?courseId=${id}`,
    webinar: `/services/webinar-information/${id}`,
    "free-students": `/services/course-operations/${id}/free-students`,
    students: `/services/course-operations/students-settlements/${id}`,
    wbs: `/services/course-wbs?courseId=${id}`,
    ads: `/services/course-operations/${id}/ad-performance`,
  };
  return COURSE_MENU_ITEMS.map(item => item.kind === "status" || item.kind === "delete"
    ? { ...item, href: null }
    : { ...item, href: paths[item.kind] });
}

export function getCourseNavigationItems(courseId: string) {
  return getCourseMenuItems(courseId).filter(item => item.kind !== "status" && item.kind !== "delete");
}
