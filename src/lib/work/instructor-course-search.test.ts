import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCoursesByInstructor,
  getCourseDestinations,
  type InstructorCourseSearchItem,
} from "./instructor-course-search";

const courses: InstructorCourseSearchItem[] = [
  {
    id: "course-1",
    statusLabel: "진행",
    name: "첫 번째 강의",
    instructorName: "김해준",
    cohort: "1",
    webinarDate: "2026. 10. 21.",
  },
  {
    id: "course-2",
    statusLabel: "진행",
    name: "두 번째 강의",
    instructorName: "박해준",
    cohort: "2",
    webinarDate: "2026. 10. 22.",
  },
];

test("강사명만 부분 검색하고 공백을 무시한다", () => {
  assert.deepEqual(
    filterCoursesByInstructor(courses, "김 해 준").map((course) => course.id),
    ["course-1"],
  );
  assert.deepEqual(filterCoursesByInstructor(courses, "첫 번째"), []);
  assert.deepEqual(filterCoursesByInstructor(courses, "  "), []);
});

test("강의별 네 화면의 링크를 만든다", () => {
  assert.deepEqual(getCourseDestinations("course/1"), [
    {
      label: "강의 상세",
      href: "/services/course-operations/course%2F1",
    },
    {
      label: "콘텐츠 관리",
      href: "/services/content-management/course%2F1",
    },
    {
      label: "수강생 관리 및 정산",
      href: "/services/course-operations/students-settlements/course%2F1",
    },
    {
      label: "강의 WBS",
      href: "/services/course-wbs?courseId=course%2F1",
    },
  ]);
});
