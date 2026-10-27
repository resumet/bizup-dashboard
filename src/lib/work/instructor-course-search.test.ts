import assert from "node:assert/strict";
import test from "node:test";

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

test("강의별 다섯 화면의 링크를 만든다", () => {
  assert.deepEqual(getCourseDestinations("course/1"), [
    {
      label: "강의 상세",
      href: "/services/course-operations/course%2F1",
    },
    {
      label: "강사 인스타그램 / 유튜브 관리",
      href: "/services/content-management/course%2F1",
    },
    {
      label: "웨비나 정보",
      href: "/services/webinar-information/course%2F1",
    },
    {
      label: "수강생 관리 및 정산",
      href: "/services/course-operations/students-settlements/course%2F1",
    },
    {
      label: "강의별 해야할일",
      href: "/services/course-wbs?courseId=course%2F1",
    },
  ]);
});

test("대시보드 강의 메뉴는 콘텐츠·웨비나·수강생·WBS·상세 순으로 만든다", () => {
  assert.deepEqual(getDashboardCourseDestinations("course/1"), [
    {
      label: "강사 인스타그램 / 유튜브 관리",
      href: "/services/content-management/course%2F1",
    },
    {
      label: "웨비나 정보",
      href: "/services/webinar-information/course%2F1",
    },
    {
      label: "수강생 관리 및 정산",
      href: "/services/course-operations/students-settlements/course%2F1",
    },
    {
      label: "강의별 해야할일",
      href: "/services/course-wbs?courseId=course%2F1",
    },
    {
      label: "강의 상세보기",
      href: "/services/course-operations/course%2F1",
    },
  ]);
});
