import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  isCourseStatus,
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
