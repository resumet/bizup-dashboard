import { getCourseNavigationItems } from "@/lib/course-operations/course-menu";

export type InstructorCourseSearchItem = {
  id: string;
  status: string;
  statusLabel: string;
  name: string;
  instructorName: string;
  cohort: string;
  webinarDate: string;
};

export type CourseDestination = ReturnType<typeof getCourseNavigationItems>[number];

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

export const getCourseDestinations = getCourseNavigationItems;
export const getDashboardCourseDestinations = getCourseNavigationItems;
