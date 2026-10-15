import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  isCourseStatus,
  isSelectableCourse,
} from "./course-status";

test("강의 상태는 진행·보류·완료·취소 네 가지만 허용한다", () => {
  assert.deepEqual(COURSE_STATUSES, [
    "ongoing",
    "on_hold",
    "completed",
    "canceled",
  ]);
  assert.deepEqual(
    COURSE_STATUSES.map((status) => COURSE_STATUS_LABELS[status]),
    ["진행", "보류", "완료", "취소"],
  );
  assert.equal(isCourseStatus("ongoing"), true);
  assert.equal(isCourseStatus("paused"), false);
  assert.equal(isCourseStatus(null), false);
});

test("강의 선택에서는 보류·완료·취소만 제외하고 원본 연결 데이터는 보존한다", () => {
  const courses = COURSE_STATUSES.map((status) => ({ id: status, status }));
  assert.deepEqual(courses.filter(isSelectableCourse).map(({ id }) => id), ["ongoing"]);
  assert.equal(courses.length, 4);
  assert.equal(isSelectableCourse({}), true);
  assert.equal(isSelectableCourse({ status: null }), true);
});
