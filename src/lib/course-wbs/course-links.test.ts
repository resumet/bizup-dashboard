import assert from "node:assert/strict";
import test from "node:test";
import { courseLinkPath, resolveSavedCourseLink, savedCourseLinkOptions, WBS_COURSE_LINK_FIELDS } from "./course-links";
import { parseWbsItems } from "./validation";
import { taskLinkHref } from "./task-links";
import { reusableItems } from "./template-items";
import { applyTemplateToCourse } from "./webinar-date";

test("선택 목록은 모든 기본 강의 링크와 이름으로 구분한 커스텀 링크를 제공하며 주소는 노출하지 않는다", () => {
  const options = savedCourseLinkOptions([
    [{ name: "교안", url: "https://private.example/a" }, { name: "교안", url: "https://private.example/b" }],
    [{ name: "설문 & 피드백", url: "https://private.example/c" }], [null, { name: 123 }, { name: "" }],
  ]);
  assert.equal(options.length, WBS_COURSE_LINK_FIELDS.length + 2);
  assert.equal(options.filter((option) => option.label === "교안 (커스텀 링크)").length, 1);
  assert(options.some((option) => option.url === courseLinkPath("payment_link")));
  assert(!JSON.stringify(options).includes("private.example"));
  const saved = parseWbsItems([{ id: "task", title: "결제 확인", link: { type: "internal", label: "결제링크", url: courseLinkPath("payment_link") } }]);
  const applied = applyTemplateToCourse(reusableItems(saved), "2026-10-30").find((item) => item.id === "task")!;
  assert.equal(taskLinkHref(applied.link!, "course-b"), "/services/course-wbs/course-b/link?key=payment_link");
});

test("공통 템플릿이 각 강의의 현재 저장 주소를 사용하며 커스텀 링크를 이름으로 찾는다", () => {
  const a = { payment_link: "https://example.com/a", custom_links: [{ name: "교안", url: "https://example.com/slides-a" }] };
  const b = { payment_link: "https://example.com/b", custom_links: [{ name: "교안", url: "https://example.com/slides-b" }] };
  assert.equal(resolveSavedCourseLink(a, "payment_link"), "https://example.com/a");
  assert.equal(resolveSavedCourseLink(b, "payment_link"), "https://example.com/b");
  a.payment_link = "https://example.com/a-updated";
  assert.equal(resolveSavedCourseLink(a, "payment_link"), "https://example.com/a-updated");
  assert.equal(resolveSavedCourseLink(a, "custom:교안"), "https://example.com/slides-a");
  assert.equal(resolveSavedCourseLink(b, "custom:교안"), "https://example.com/slides-b");
  assert(courseLinkPath("custom:설문 & 피드백").includes(encodeURIComponent("custom:설문 & 피드백")));
});

test("비어 있거나 삭제·중복된 링크와 허용하지 않은 필드·실행 주소로는 이동하지 않는다", () => {
  for (const url of ["", "javascript:alert(1)", "//evil.example", "data:text/html,test", "https://user:password@example.com", "https://example.com/\\evil"]) {
    assert.equal(resolveSavedCourseLink({ payment_link: url }, "payment_link"), null);
  }
  assert.equal(resolveSavedCourseLink({}, "payment_link"), null);
  assert.equal(resolveSavedCourseLink({ workspace_id: "https://example.com" }, "workspace_id"), null);
  assert.equal(resolveSavedCourseLink({ custom_links: [{ name: "교안", url: "https://example.com/a" }, { name: "교안", url: "https://example.com/b" }] }, "custom:교안"), null);
  assert.equal(resolveSavedCourseLink({ custom_links: [] }, "custom:교안"), null);
});
