import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_JOB_NOTE_MAX_LENGTH,
  parseCourseJobNoteContent,
} from "./notes";

test("명단 메모는 공백을 제거하고 빈 값과 2,000자 초과를 거부한다", () => {
  assert.equal(parseCourseJobNoteContent("  확인 필요  "), "확인 필요");
  assert.throws(() => parseCourseJobNoteContent("   "), /내용을 입력/u);
  assert.doesNotThrow(() =>
    parseCourseJobNoteContent("가".repeat(COURSE_JOB_NOTE_MAX_LENGTH)),
  );
  assert.throws(
    () =>
      parseCourseJobNoteContent(
        "가".repeat(COURSE_JOB_NOTE_MAX_LENGTH + 1),
      ),
    /최대 2,000자/u,
  );
});
