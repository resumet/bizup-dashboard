export type InstructorCourseSearchItem = {
  id: string;
  status: string;
  statusLabel: string;
  name: string;
  instructorName: string;
  cohort: string;
  webinarDate: string;
};

export type CourseDestination = {
  kind: "detail" | "instagram" | "youtube" | "webinar" | "students" | "wbs";
  label: string;
  href: string;
};

function normalizeSearchValue(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("ko-KR");
}

export function filterCoursesByInstructor(
  courses: readonly InstructorCourseSearchItem[],
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return [];

  return courses.filter((course) =>
    normalizeSearchValue(course.instructorName).includes(normalizedQuery),
  );
}

export function getOngoingInstructorNames(
  courses: readonly InstructorCourseSearchItem[],
) {
  const names = new Map<string, string>();

  for (const course of courses) {
    if (course.status !== "ongoing") continue;
    const name = course.instructorName.trim();
    if (!name) continue;
    const key = normalizeSearchValue(name);
    if (!names.has(key)) names.set(key, name);
  }

  return [...names.values()];
}

function buildCourseDestinations(courseId: string) {
  const encodedCourseId = encodeURIComponent(courseId);

  return {
    detail: {
      kind: "detail",
      label: "강의 상세",
      href: `/services/course-operations/${encodedCourseId}`,
    },
    instagram: {
      kind: "instagram",
      label: "강사 인스타그램 관리",
      href: `/services/instagram-management/${encodedCourseId}`,
    },
    youtube: {
      kind: "youtube",
      label: "유튜브 출연 관리",
      href: `/services/youtube-management/${encodedCourseId}`,
    },
    webinarInformation: {
      kind: "webinar",
      label: "웨비나 정보",
      href: `/services/webinar-information/${encodedCourseId}`,
    },
    students: {
      kind: "students",
      label: "수강생 관리 및 정산",
      href: `/services/course-operations/students-settlements/${encodedCourseId}`,
    },
    wbs: {
      kind: "wbs",
      label: "강의별 해야할일",
      href: `/services/course-wbs?courseId=${encodedCourseId}`,
    },
  } satisfies Record<"detail" | "instagram" | "youtube" | "webinarInformation" | "students" | "wbs", CourseDestination>;
}

export function getCourseDestinations(courseId: string): CourseDestination[] {
  const destinations = buildCourseDestinations(courseId);
  return [
    destinations.detail,
    destinations.instagram,
    destinations.youtube,
    destinations.webinarInformation,
    destinations.students,
    destinations.wbs,
  ];
}

export function getDashboardCourseDestinations(courseId: string): CourseDestination[] {
  const destinations = buildCourseDestinations(courseId);
  return [
    destinations.instagram,
    destinations.youtube,
    destinations.webinarInformation,
    destinations.students,
    destinations.wbs,
    { ...destinations.detail, label: "강의 상세보기" },
  ];
}
