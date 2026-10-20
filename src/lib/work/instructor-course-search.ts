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

export function getCourseDestinations(courseId: string): CourseDestination[] {
  const encodedCourseId = encodeURIComponent(courseId);

  return [
    {
      label: "강의 상세",
      href: `/services/course-operations/${encodedCourseId}`,
    },
    {
      label: "콘텐츠 관리",
      href: `/services/content-management/${encodedCourseId}`,
    },
    {
      label: "수강생 관리 및 정산",
      href: `/services/course-operations/students-settlements/${encodedCourseId}`,
    },
    {
      label: "강의 WBS",
      href: `/services/course-wbs?courseId=${encodedCourseId}`,
    },
  ];
}
