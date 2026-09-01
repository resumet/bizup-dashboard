import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_NOTE_MAX_LENGTH,
  parseCourseNoteContent,
  tokenizeCourseNoteContent,
} from "./notes";

test("강의 메모는 공백을 제거하고 빈 값과 최대 글자 수 초과를 거부한다", () => {
  assert.equal(parseCourseNoteContent("  확인 필요  "), "확인 필요");
  assert.throws(() => parseCourseNoteContent("   "), /내용을 입력/u);
  assert.doesNotThrow(() =>
    parseCourseNoteContent("가".repeat(COURSE_NOTE_MAX_LENGTH)),
  );
  assert.throws(
    () => parseCourseNoteContent("가".repeat(COURSE_NOTE_MAX_LENGTH + 1)),
    /최대/u,
  );
});

test("메모의 HTTP·HTTPS URL과 뒤쪽 문장부호를 분리한다", () => {
  assert.deepEqual(
    tokenizeCourseNoteContent(
      "자료: https://example.com/file?id=1, 문의 http://example.org/help.",
    ),
    [
      { type: "text", value: "자료: " },
      {
        type: "link",
        value: "https://example.com/file?id=1",
        href: "https://example.com/file?id=1",
      },
      { type: "text", value: "," },
      { type: "text", value: " 문의 " },
      {
        type: "link",
        value: "http://example.org/help",
        href: "http://example.org/help",
      },
      { type: "text", value: "." },
    ],
  );
});

test("URL이 없는 메모는 하나의 일반 텍스트 토큰으로 유지한다", () => {
  assert.deepEqual(tokenizeCourseNoteContent("일반 메모\n두 번째 줄"), [
    { type: "text", value: "일반 메모\n두 번째 줄" },
  ]);
});
