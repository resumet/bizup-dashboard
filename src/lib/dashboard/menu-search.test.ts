import assert from "node:assert/strict";
import test from "node:test";

import { filterDashboardCourses, filterDashboardMenus } from "./menu-search";

test("새 메뉴명과 기존 메뉴명 모두 같은 메뉴를 추천한다", () => {
  assert.equal(filterDashboardMenus("인스타그램")[0]?.href, "/services/instagram-management");
  assert.equal(filterDashboardMenus("유튜브 출연")[0]?.href, "/services/youtube-management");
  assert.deepEqual(filterDashboardMenus("콘텐츠 관리").map(({ href }) => href), [
    "/services/instagram-management",
    "/services/youtube-management",
  ]);
  assert.equal(filterDashboardMenus("강의 WBS")[0]?.href, "/services/course-wbs");
});

test("업무 관리 허브와 강의 일정 플래너를 새 위치로 추천한다", () => {
  const hub = filterDashboardMenus("업무 관리")[0];
  const result = filterDashboardMenus("강의 일정 플래너")[0];

  assert.equal(hub?.href, "/services/work-management");
  assert.equal(hub?.group, "강의 운영");
  assert.equal(result?.href, "/services/course-schedule-planner");
  assert.equal(result?.group, "근태관리/업무일지/비품신청");
});

test("명단 · 메시지의 도구 허브와 영상 대본 추출을 추천한다", () => {
  const hub = filterDashboardMenus("업무 도구")[0];
  const transcription = filterDashboardMenus("영상 대본 추출")[0];

  assert.equal(hub?.href, "/services/tools");
  assert.equal(hub?.group, "명단 · 메시지");
  assert.equal(transcription?.href, "/extras");
  assert.equal(transcription?.group, "도구");
});

test("수강생 관리와 하위 메뉴를 추천한다", () => {
  const hub = filterDashboardMenus("수강생 관리")[0];
  const result = filterDashboardMenus("수강생 관리 및 정산")[0];

  assert.equal(hub?.href, "/services/student-management");
  assert.equal(hub?.group, "명단 · 메시지");
  assert.equal(result?.href, "/services/course-operations/students-settlements");
  assert.equal(result?.group, "수강생 관리");
});

test("변경된 웨비나 메뉴명과 기존 검색어를 모두 지원한다", () => {
  assert.equal(filterDashboardMenus("웨비나진행 결과관리")[0]?.href, "/services/course-webinars");
  assert.equal(filterDashboardMenus("라이브 웨비나")[0]?.href, "/services/course-webinars");
});

test("업무일지의 새 메뉴명과 기존 팀 업무 검색어를 모두 지원한다", () => {
  const workJournalResults = filterDashboardMenus("업무일지").map(
    ({ href }) => href,
  );
  assert.equal(workJournalResults[0], "/services/work-management");
  assert.ok(workJournalResults.includes("/hr"));
  assert.equal(filterDashboardMenus("팀 업무")[0]?.href, "/hr");
});

test("외부 마케팅과 광고성과는 퍼포먼스 광고로, 입출금 장부는 관리자로 분류한다", () => {
  assert.equal(filterDashboardMenus("외부 마케팅")[0]?.group, "퍼포먼스 광고");
  assert.equal(filterDashboardMenus("광고성과")[0]?.group, "퍼포먼스 광고");
  assert.equal(filterDashboardMenus("입출금 장부")[0]?.group, "관리자");
});

test("관리자가 추가한 검색어로 메뉴를 추천한다", () => {
  const result = filterDashboardMenus("결제 확인", {
    "/services/course-operations/students-settlements": ["결제 확인", "정산 대상"],
  });

  assert.deepEqual(result.map(({ href }) => href), ["/services/course-operations/students-settlements"]);
});

test("강사명과 강의명으로 강의를 검색한다", () => {
  const courses = [
    { id: "a", name: "마케팅 실전", instructor: "김선아", cohort: "1기", webinarDate: "2026년 11월 1일" },
    { id: "b", name: "브랜딩 기초", instructor: "신예영", cohort: "2기", webinarDate: "2026년 12월 1일" },
  ];
  assert.deepEqual(filterDashboardCourses(courses, "김 선아").map(({ id }) => id), ["a"]);
  assert.deepEqual(filterDashboardCourses(courses, "브랜딩").map(({ id }) => id), ["b"]);
});
