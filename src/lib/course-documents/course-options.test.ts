import assert from "node:assert/strict";
import test from "node:test";

import { activeInstagramCourses, instagramCourseOptionLabel } from "./course-options";
import type { CourseDocumentCourse } from "./types";

function course(overrides: Partial<CourseDocumentCourse> = {}): CourseDocumentCourse {
  return {
    id: "course-1",
    name: "마케팅 실전 클래스",
    instructorName: "김강사",
    cohort: "1",
    freeWebinarAt: "2026-10-01T19:30:00+09:00",
    externalEditEnabled: false,
    externalAccessToken: "",
    planningSheetUrl: "",
    materials: [],
    documents: [],
    ...overrides,
  };
}

test("무료 웨비나 D+3부터 인스타그램 강의 선택 목록에서 제외한다", () => {
  const courses = [
    course({ id: "d-plus-2", freeWebinarAt: "2026-09-29T19:30:00+09:00" }),
    course({ id: "d-plus-3", freeWebinarAt: "2026-09-28T19:30:00+09:00" }),
    course({ id: "future", freeWebinarAt: "2026-10-02T19:30:00+09:00" }),
  ];

  assert.deepEqual(activeInstagramCourses(courses, "2026-10-01").map(({ id }) => id), ["d-plus-2", "future"]);
});

test("강의 선택 항목에 기수·강의명·강사명·웨비나 날짜를 표시한다", () => {
  assert.equal(
    instagramCourseOptionLabel(course()),
    "1기 · 마케팅 실전 클래스 · 김강사 · 2026. 10. 1.",
  );
  assert.equal(
    instagramCourseOptionLabel(course({ cohort: "2기" })),
    "2기 · 마케팅 실전 클래스 · 김강사 · 2026. 10. 1.",
  );
});
