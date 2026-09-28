import assert from "node:assert/strict";
import test from "node:test";

import { getCourseMissingItems, partitionCoursesByWebinarStatus } from "./course-list-status";
import type { CourseSummary } from "./types";

function course(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    id: "course-1",
    name: "테스트 강의",
    instructor_name: "강사",
    banner_image_path: "banner.webp",
    free_webinar_at: "2026-09-28T19:30:00+09:00",
    starts_at: "2026-10-01T00:00:00+09:00",
    updated_at: "2026-09-01T00:00:00Z",
    required_tasks: [
      { key: "free-webinar-assets", title: "무료특강 배너 + 상페", dueDate: "", completed: true },
      { key: "paid-course-assets", title: "유료특강 배너 + 상페 + 동영상", dueDate: "", completed: true },
      { key: "course-materials", title: "교안", dueDate: "", completed: true },
    ],
    course_options: [{ id: "option" }],
    course_jobs: [{ id: "job" }],
    message_studio_projects: [{ id: "message" }],
    cohort: "1",
    nova_settled: false,
    instructor_settled: false,
    landing_page_link: "https://example.com/landing",
    free_kakao_room_1_link: "https://example.com/free",
    free_kakao_room_2_link: "",
    paid_kakao_room_link: "https://example.com/paid",
    payment_link: "https://example.com/payment",
    curriculum_link: "https://example.com/curriculum",
    course_materials_link: "https://example.com/materials",
    ...overrides,
  };
}

test("웨비나 D+3부터 완료 강의로 분리한다", () => {
  const courses = [
    course({ id: "d-plus-2", free_webinar_at: "2026-09-26T19:30:00+09:00" }),
    course({ id: "d-plus-3", free_webinar_at: "2026-09-25T19:30:00+09:00" }),
    course({ id: "future", free_webinar_at: "2026-10-01T19:30:00+09:00" }),
  ];
  const result = partitionCoursesByWebinarStatus(courses, "2026-09-28");
  assert.deepEqual(result.ongoing.map(({ id }) => id), ["d-plus-2", "future"]);
  assert.deepEqual(result.completed.map(({ id }) => id), ["d-plus-3"]);
});

test("진행 중 강의에서 채워야 할 운영 항목과 미완료 필수 작업을 찾는다", () => {
  const issues = getCourseMissingItems(course({
    banner_image_path: "",
    payment_link: "",
    course_jobs: [],
    required_tasks: [
      { key: "free-webinar-assets", title: "무료특강 배너 + 상페", dueDate: "", completed: false },
    ],
  }));
  assert.deepEqual(issues.map(({ label }) => label), [
    "강의 배너",
    "결제 링크",
    "수강생 명단",
    "필수 작업 · 무료특강 배너 + 상페",
  ]);
});
