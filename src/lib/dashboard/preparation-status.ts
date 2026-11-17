import type { WbsCourse, WbsScheduleEntry } from "@/lib/course-wbs/types";

export const PREPARATION_STATUS_COLUMNS = [
  { key: "freeDetail", label: "무료상페", titles: ["무료 웨비나 상세페이지제작 및 수령", "무료 웨비나 상세페이지 제작"] },
  { key: "paidDetail", label: "유료상세", titles: ["유료 결제 페이지 제작"] },
  { key: "adFilming", label: "광고촬영", titles: ["광고 영상 촬영 진행"] },
  { key: "rehearsal1", label: "리허설1차", titles: ["리허설 1차 진행"] },
  { key: "rehearsal2", label: "리허설2차", titles: ["리허설 2차 진행"] },
  { key: "rehearsal3", label: "리허설3차", titles: ["리허설 3차 진행"] },
  { key: "finalRehearsal", label: "최종리허설", titles: ["최종 리허설 진행"] },
] as const;

type PreparationStatusKey = (typeof PREPARATION_STATUS_COLUMNS)[number]["key"];
export type DashboardPreparationStatus = {
  courseId: string;
  instructorName: string;
  courseName: string;
  completion: Record<PreparationStatusKey, boolean>;
};

function normalized(value: string) {
  return value.replace(/\s/gu, "");
}

export function dashboardPreparationStatuses(courses: WbsCourse[], schedules: WbsScheduleEntry[]): DashboardPreparationStatus[] {
  const schedulesByCourse = new Map(schedules.map((schedule) => [schedule.courseId, schedule.items]));
  return courses.filter((course) => course.status === "ongoing").map((course) => {
    const items = schedulesByCourse.get(course.id) ?? [];
    const completion = Object.fromEntries(PREPARATION_STATUS_COLUMNS.map((column) => [
      column.key,
      items.some((item) => item.completed && column.titles.some((title) => normalized(item.title) === normalized(title))),
    ])) as Record<PreparationStatusKey, boolean>;
    return { courseId: course.id, instructorName: course.instructorName || "강사 미정", courseName: course.name, completion };
  });
}
