import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCourseShareSummary,
  truncateKakaoShareText,
  type CourseShareData,
} from "./share";

const data: CourseShareData = {
  name: "AI 수익화 클래스",
  instructorName: "권강사",
  freeWebinarDate: "2026-09-01",
  freeWebinarTime: "19:30",
  startsDate: "2026-09-10",
  earlyBirdEvent: "10만원 할인",
  first50Event: "워크북 증정",
  landingPageLink: "https://example.com/landing",
  freeKakaoRoom1Link: "https://open.kakao.com/free1",
  freeKakaoRoom2Link: "",
  communicationRoomLink: "https://open.kakao.com/community",
  paymentLink: "https://example.com/payment",
  inquiryLink: "",
  curriculumLink: "",
  freeGiftLink: "",
  courseViewingLink: "",
  options: [{ name: "기본반", listPrice: "500000", salePrice: "390000" }],
  youtubeAppearances: [],
};

test("선택한 강의 섹션만 카톡 공유용 요약문에 포함한다", () => {
  const summary = buildCourseShareSummary(data, ["schedule", "links"]);
  assert.match(summary, /AI 수익화 클래스/u);
  assert.match(summary, /2026년 9월 1일 오후 7시 30분/u);
  assert.match(summary, /기본 랜딩페이지/u);
  assert.match(summary, /https:\/\/example.com\/landing/u);
  assert.match(summary, /무료카톡방 1번/u);
  assert.doesNotMatch(summary, /10만원 할인/u);
  assert.doesNotMatch(summary, /워크북 증정/u);
});

test("옵션 요약에 가격과 할인율을 표시한다", () => {
  const summary = buildCourseShareSummary(data, ["options"]);
  assert.match(summary, /기본반/u);
  assert.match(summary, /500,000원/u);
  assert.match(summary, /390,000원/u);
  assert.match(summary, /22% 할인/u);
});

test("카카오 텍스트 템플릿 제한에 맞춰 이모지를 깨뜨리지 않고 200자로 줄인다", () => {
  const value = `📚${"가".repeat(250)}`;
  const truncated = truncateKakaoShareText(value);
  assert.equal(Array.from(truncated).length, 200);
  assert.equal(truncated.endsWith("…"), true);
  assert.equal(truncated.startsWith("📚"), true);
});
