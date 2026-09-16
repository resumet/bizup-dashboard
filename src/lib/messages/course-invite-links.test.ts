import assert from "node:assert/strict";
import test from "node:test";
import { buildCourseInviteLinks } from "./course-invite-links";

test("입장 링크는 강의의 기본·사용자 추가·옵션 링크 전체에서 가져온다", () => {
  const links = buildCourseInviteLinks({
    paid_kakao_room_link: "https://example.test/paid",
    inquiry_link: "https://example.test/help",
    course_viewing_link: "https://example.test/watch",
    course_materials_link: "https://example.test/materials",
    custom_links: [{ name: "실습실", url: "https://example.test/lab" }],
  }, [{ name: "심화반", group_chat_link: "https://example.test/advanced" }]);
  assert.deepEqual(links.map(link => link.label), ["유료수강생단톡방", "문의하기 링크", "강의 시청하기 링크", "강의자료", "실습실", "심화반 옵션 단톡방"]);
  assert.equal(links[0].url, "https://example.test/paid");
});

test("중복 URL과 비어 있거나 잘못된 링크를 제외하고 HTTP 링크는 안내할 수 있도록 유지한다", () => {
  const links = buildCourseInviteLinks({
    paid_kakao_room_link: " https://example.test/paid ",
    free_kakao_room_1_link: "",
    payment_link: "javascript:alert(1)",
    custom_links: [null, { name: "중복", url: "https://example.test/paid" }, { name: "기존 HTTP", url: "http://example.test/legacy" }, { name: "오류", url: "not-a-url" }],
  }, [{ name: "기본반", group_chat_link: "https://example.test/paid" }]);
  assert.deepEqual(links, [
    { label: "유료수강생단톡방", url: "https://example.test/paid" },
    { label: "기존 HTTP", url: "http://example.test/legacy" },
  ]);
  assert.deepEqual(buildCourseInviteLinks({}), []);
  assert.deepEqual(buildCourseInviteLinks({ custom_links: {} }), []);
});
