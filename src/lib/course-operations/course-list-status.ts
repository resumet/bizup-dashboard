import type { CourseSummary } from "./types";
import { getWebinarDayDifference } from "./webinar-proximity";

export const COURSE_COMPLETION_AFTER_DAYS = 3;

export type CourseMissingItem = {
  key: string;
  label: string;
};

export function partitionCoursesByWebinarStatus(
  courses: readonly CourseSummary[],
  todayKoreaDate: string,
) {
  const ongoing: CourseSummary[] = [];
  const completed: CourseSummary[] = [];
  for (const course of courses) {
    const days = getWebinarDayDifference(course.free_webinar_at, todayKoreaDate);
    (days !== null && days <= -COURSE_COMPLETION_AFTER_DAYS ? completed : ongoing).push(course);
  }
  return { ongoing, completed };
}

export function getCourseMissingItems(course: CourseSummary): CourseMissingItem[] {
  const missing: CourseMissingItem[] = [];
  const add = (condition: boolean, key: string, label: string) => {
    if (condition) missing.push({ key, label });
  };

  add(!course.banner_image_path, "banner", "강의 배너");
  add(!course.cohort?.trim(), "cohort", "기수");
  add(!course.landing_page_link, "landing-page", "랜딩페이지 링크");
  add(!course.free_kakao_room_1_link && !course.free_kakao_room_2_link, "free-kakao", "무료 카톡방 링크");
  add(!course.paid_kakao_room_link, "paid-kakao", "유료 수강생 단톡방 링크");
  add(!course.payment_link, "payment", "결제 링크");
  add(!course.curriculum_link, "curriculum", "커리큘럼 링크");
  add(!course.course_materials_link, "materials-link", "강의자료 링크");
  add(course.course_options.length === 0, "options", "강의 옵션");
  add(course.course_jobs.length === 0, "roster", "수강생 명단");
  add(course.message_studio_projects.length === 0, "messages", "문자 제작물");
  for (const task of course.required_tasks) {
    add(!task.completed, `task-${task.key}`, `필수 작업 · ${task.title}`);
  }
  return missing;
}
