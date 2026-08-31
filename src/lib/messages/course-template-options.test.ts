import assert from "node:assert/strict";
import test from "node:test";

import {
  getCourseLinkOptions,
  formatCourseSelectionLabel,
  isCourseLinkVariable,
  isCourseNameVariable,
  type MessageCourse,
} from "./course-template-options";

const course: MessageCourse = {
  id: "course-1",
  name: "AI 자동화 강의",
  instructor_name: "플랫폼트리x맹렬",
  free_kakao_room_1_link: "https://example.com/kakao-1",
  free_kakao_room_2_link: "https://example.com/kakao-2",
  communication_room_link: "https://example.com/community",
  payment_link: "https://example.com/payment",
  inquiry_link: "https://example.com/inquiry",
  curriculum_link: "https://example.com/curriculum",
  free_gift_link: "https://example.com/gift",
  course_viewing_link: "https://example.com/watch",
};

test("강의 선택 표시와 Shoong 변수 값을 강사명의 강의명 형식으로 만든다", () => {
  assert.equal(
    formatCourseSelectionLabel({
      ...course,
      name: "퍼널 수익화 마케팅",
    }),
    "플랫폼트리x맹렬의 퍼널 수익화 마케팅",
  );
  assert.equal(
    formatCourseSelectionLabel({ ...course, instructor_name: "" }),
    "AI 자동화 강의",
  );
});

test("강의명·강좌명과 링크·링크명 변수를 강의 선택 변수로 구분한다", () => {
  assert.equal(isCourseNameVariable("강의명"), true);
  assert.equal(isCourseNameVariable("강좌명"), true);
  assert.equal(isCourseNameVariable("강의시간"), false);
  assert.equal(isCourseLinkVariable("링크"), true);
  assert.equal(isCourseLinkVariable("링크명"), true);
  assert.equal(isCourseLinkVariable("입장코드"), false);
});

test("선택한 강의에서 이름과 URL을 가진 링크 옵션 8개를 만든다", () => {
  const options = getCourseLinkOptions(course);
  assert.equal(options.length, 8);
  assert.deepEqual(
    options.map((option) => option.label),
    [
      "무료카톡방 1번",
      "무료카톡방 2번",
      "소통방",
      "결제링크",
      "문의하기 링크",
      "커리큘럼 보기 링크",
      "무료강의 수강 선물받기 링크",
      "강의 시청하기 링크",
    ],
  );
});
