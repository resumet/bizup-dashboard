import assert from "node:assert/strict";
import test from "node:test";

import { filterDashboardCourses, filterDashboardMenus } from "./menu-search";

test("새 메뉴명과 기존 메뉴명 모두 같은 메뉴를 추천한다", () => {
  assert.equal(filterDashboardMenus("인스타그램")[0]?.href, "/services/content-management");
  assert.equal(filterDashboardMenus("콘텐츠 관리")[0]?.href, "/services/content-management");
  assert.equal(filterDashboardMenus("강의 WBS")[0]?.href, "/services/course-wbs");
});

test("강의 일정 플래너를 도구 메뉴로 추천한다", () => {
  const result = filterDashboardMenus("강의 일정 플래너")[0];

  assert.equal(result?.href, "/services/course-schedule-planner");
  assert.equal(result?.group, "도구");
});

test("강사명과 강의명으로 강의를 검색한다", () => {
  const courses = [
    { id: "a", name: "마케팅 실전", instructor: "김선아", cohort: "1기", webinarDate: "2026년 11월 1일" },
    { id: "b", name: "브랜딩 기초", instructor: "신예영", cohort: "2기", webinarDate: "2026년 12월 1일" },
  ];
  assert.deepEqual(filterDashboardCourses(courses, "김 선아").map(({ id }) => id), ["a"]);
  assert.deepEqual(filterDashboardCourses(courses, "브랜딩").map(({ id }) => id), ["b"]);
});
