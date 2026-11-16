import { getCourseNavigationItems } from "./course-menu";
import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_LIST_COLLAPSIBLE_STATUS_ORDER,
  COURSE_LIST_INITIAL_OPEN_STATUSES,
  formatCourseWbsProgress,
  getCourseManagementDestinations,
} from "./course-list-display";

test("완료·취소·보류 순서와 접힌 초기 상태를 유지한다", () => {
  assert.deepEqual(COURSE_LIST_COLLAPSIBLE_STATUS_ORDER, ["completed", "canceled", "on_hold"]);
  assert.deepEqual(COURSE_LIST_INITIAL_OPEN_STATUSES, { completed: false, canceled: false, on_hold: false });
});

test("강의 목록 메뉴는 공통 정의의 항목과 순서를 사용한다", () => {
  assert.deepEqual(getCourseManagementDestinations("course/1"), getCourseNavigationItems("course/1"));
});

test("WBS 전체 항목과 일정이 지난 항목 수를 함께 표시한다", () => {
  assert.equal(formatCourseWbsProgress(3, 28), "일정 지남 3개 / 전체 28개");
});
