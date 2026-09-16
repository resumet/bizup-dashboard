import assert from "node:assert/strict";
import test from "node:test";

import {
  courseRosterSharePath,
  courseRosterShareTitle,
  createCourseRosterShareSignature,
  verifyCourseRosterShareSignature,
} from "./public-share";

const courseId = "11111111-1111-4111-8111-111111111111";
const secret = "a-secure-share-secret-with-at-least-32-characters";

test("강의별 서명 링크를 만들고 위조된 서명을 거부한다", () => {
  const signature = createCourseRosterShareSignature(courseId, secret);
  assert.equal(signature.length, 64);
  assert.equal(verifyCourseRosterShareSignature(courseId, signature, secret), true);
  assert.equal(verifyCourseRosterShareSignature(courseId, `${signature.slice(0, -1)}0`, secret), false);
  assert.equal(
    courseRosterSharePath(courseId, signature),
    `/public/course-roster/${courseId}/${signature}`,
  );
  assert.throws(() => createCourseRosterShareSignature("invalid", secret));
});

test("공유 페이지 제목을 강사명과 강의명으로 만든다", () => {
  assert.equal(courseRosterShareTitle(" 김강사 ", " 기본반 "), "김강사 - 기본반 결제명단");
  assert.equal(courseRosterShareTitle("", "기본반"), "기본반 결제명단");
  assert.equal(courseRosterShareTitle("", ""), "강의 결제명단");
});
