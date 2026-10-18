export const YOUTUBE_COURSE_GROUPS = [
  { key: "ongoing", label: "진행중", defaultOpen: true },
  { key: "completed", label: "완료", defaultOpen: false },
  { key: "canceled", label: "취소", defaultOpen: false },
  { key: "on_hold", label: "보류", defaultOpen: false },
] as const;

type YoutubeCourseGroupKey = (typeof YOUTUBE_COURSE_GROUPS)[number]["key"];

export function countYoutubeAppearances(appearances: readonly { request_status: string }[]) {
  return {
    appearanceCount: appearances.length,
    confirmedAppearanceCount: appearances.filter((appearance) => appearance.request_status === "confirmed").length,
  };
}

export function groupYoutubeCourses<T extends { status?: string | null }>(courses: readonly T[]) {
  const grouped: Record<YoutubeCourseGroupKey, T[]> = {
    ongoing: [],
    completed: [],
    canceled: [],
    on_hold: [],
  };
  for (const course of courses) {
    if (course.status === "completed" || course.status === "canceled" || course.status === "on_hold") {
      grouped[course.status].push(course);
    } else {
      grouped.ongoing.push(course);
    }
  }
  return grouped;
}
