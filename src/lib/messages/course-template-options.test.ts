import assert from "node:assert/strict";
import test from "node:test";

import {
  getCourseLinkOptions,
  getLinkedMessageCourse,
  getSelectedCourseLinkField,
  formatCourseSelectionLabel,
  getCourseSelectionVariables,
  isInstructorNameVariable,
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
  paid_kakao_room_link: "https://open.kakao.com/o/paid-students",
  communication_room_link: "https://example.com/community",
  payment_link: "https://example.com/payment",
  inquiry_link: "https://example.com/inquiry",
  curriculum_link: "https://example.com/curriculum",
  free_gift_link: "https://example.com/gift",
  course_viewing_link: "https://example.com/watch",
};

test("강사명은 강의 이름과 분리된 강사 값으로 입력하고 다른 변수는 유지한다", () => {
  assert.equal(isInstructorNameVariable(" 강사명 "), true);
  assert.equal(isInstructorNameVariable("강좌명"), false);
  assert.deepEqual(getCourseSelectionVariables(["강사명", "강좌명", "고객명", "링크명"], course), {
    강사명: "플랫폼트리x맹렬",
    강좌명: "플랫폼트리x맹렬의 AI 자동화 강의",
    링크명: "",
  });
  assert.deepEqual(getCourseSelectionVariables(["강사명"], { ...course, instructor_name: " 다른 강사 " }), { 강사명: "다른 강사" });
  assert.deepEqual(getCourseSelectionVariables(["강사명"], { ...course, instructor_name: "" }), { 강사명: "" });
  assert.deepEqual(getCourseSelectionVariables(["강사명"]), { 강사명: "" });
});

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
  assert.equal(isCourseLinkVariable("입장링크"), true);
  assert.equal(isCourseLinkVariable("입장코드"), false);
});

test("선택한 강의의 링크 관리 기본 항목 10개를 모두 포함한다", () => {
  const options = getCourseLinkOptions(course);
  assert.equal(options.length, 10);
  assert.equal(options.find((option) => option.field === "paid_kakao_room_link")?.url, course.paid_kakao_room_link);
  assert.deepEqual(
    options.map((option) => option.label),
    [
      "기본 랜딩페이지",
      "무료카톡방 1번",
      "무료카톡방 2번",
      "유료수강생단톡방",
      "소통방",
      "결제링크",
      "문의하기 링크",
      "커리큘럼 보기 링크",
      "무료강의 수강 선물받기 링크",
      "강의 시청하기 링크",
    ],
  );
});

test("이름에 링크·URL·link 또는 웹 접속 주소가 포함된 모든 변수를 링크 입력으로 분류한다", () => {
  const names = ["결제링크", "신청 링크", "시청링크1", "강의자료링크", "오픈채팅방링크", "URL", "입장_URL", "paymentLink", "course_url", "LINK_2", "접속 주소", "웹주소", "홈페이지", "웹사이트"];
  for (const name of names) assert.equal(isCourseLinkVariable(name), true, name);
  assert.deepEqual(getCourseSelectionVariables(names, course), Object.fromEntries(names.map((name) => [name, ""])));
  for (const name of ["강좌명", "강사명", "고객명", "전화번호", "입장코드", "배송주소", "이메일주소", ""]) {
    assert.equal(isCourseLinkVariable(name), false, name);
  }
});

test("링크 관리의 커스텀 이름과 URL을 포함하고 비어 있거나 잘못된 항목은 제외한다", () => {
  const options = getCourseLinkOptions({ ...course, landing_page_link: " https://example.com/landing ", custom_links: [
    { name: " 강의 자료 ", url: " https://example.com/materials " },
    { name: "강의 자료", url: "https://example.com/other" },
    { name: "", url: "https://example.com" }, { name: "준비 중", url: "" }, null, { url: 123 },
  ] });
  assert.equal(options[0].url, "https://example.com/landing");
  assert.deepEqual(options.slice(10), [
    { field: "custom:0", label: "강의 자료", url: "https://example.com/materials" },
    { field: "custom:1", label: "강의 자료", url: "https://example.com/other" },
  ]);
  assert.equal(getCourseLinkOptions({ ...course, custom_links: {} }).length, 10);
});

test("명단·주소록에 연결된 강의를 찾고 여러 강의가 연결된 주소록은 자동 선택하지 않는다", () => {
  const linked = { ...course, free_address_book_id: "book-1" };
  assert.equal(getLinkedMessageCourse([linked], "book-1")?.id, course.id);
  assert.equal(getLinkedMessageCourse([linked], "roster:job-1", course.id)?.id, course.id);
  assert.equal(getLinkedMessageCourse([linked], "other"), undefined);
  assert.equal(getLinkedMessageCourse([linked, { ...linked, id: "course-2" }], "book-1"), undefined);
});

test("같은 URL의 다른 후보 이름과 직접 입력 선택을 유지하며 바뀐 후보를 잘못 표시하지 않는다", () => {
  const options = [{ field: "link", url: "https://example.com" }, { field: "custom:0", url: "https://example.com" }];
  assert.equal(getSelectedCourseLinkField(options, "https://example.com", "custom:0"), "custom:0");
  assert.equal(getSelectedCourseLinkField(options, "https://example.com", "__manual__"), "__manual__");
  assert.equal(getSelectedCourseLinkField(options, "https://other.com", "custom:0"), "__manual__");
  assert.equal(getSelectedCourseLinkField([], "https://manual.com"), "__manual__");
});
