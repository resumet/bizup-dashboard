import assert from "node:assert/strict";
import test from "node:test";
import { getCourseNavigationItems } from "@/lib/course-operations/course-menu";

test("검색과 대시보드는 동일한 공통 메뉴 순서를 사용한다", () => {
  assert.deepEqual(getCourseDestinations("course/1"), getCourseNavigationItems("course/1"));
  assert.deepEqual(getCourseDestinations("course/1"), getDashboardCourseDestinations("course/1"));
  assert.ok(getCourseDestinations("course/1").some(item => item.kind === "free-students"));
  assert.equal(getCourseDestinations("course/1")[0].href, "/services/course-operations/course%2F1");
});

import {
  filterCoursesByInstructor,
  getCourseDestinations,
  getDashboardCourseDestinations,
  getOngoingInstructorNames,
  type InstructorCourseSearchItem,
} from "./instructor-course-search";

const courses: InstructorCourseSearchItem[] = [
  {
    id: "course-1",
    status: "ongoing",
    statusLabel: "진행",
    name: "첫 번째 강의",
    instructorName: "김해준",
    cohort: "1",
    webinarDate: "2026. 10. 21.",
  },
  {
    id: "course-2",
    status: "completed",
    statusLabel: "완료",
    name: "두 번째 강의",
    instructorName: "박해준",
    cohort: "2",
    webinarDate: "2026. 10. 22.",
  },
];

test("진행 중인 강사의 이름만 일정순으로 중복 없이 반환한다", () => {
  assert.deepEqual(
    getOngoingInstructorNames([
      ...courses,
      { ...courses[0], id: "course-3", instructorName: " 김 해 준 " },
      { ...courses[0], id: "course-4", instructorName: "이해준" },
      { ...courses[0], id: "course-5", instructorName: "  " },
    ]),
    ["김해준", "이해준"],
  );
});

test("강사명만 부분 검색하고 공백을 무시한다", () => {
  assert.deepEqual(
    filterCoursesByInstructor(courses, "김 해 준").map((course) => course.id),
    ["course-1"],
  );
  assert.deepEqual(filterCoursesByInstructor(courses, "첫 번째"), []);
  assert.deepEqual(filterCoursesByInstructor(courses, "  "), []);
});
