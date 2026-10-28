import assert from "node:assert/strict";
import test from "node:test";
import { parseWbsItems, WbsInputError } from "./validation";
import { taskLink, taskLinkHref } from "./task-links";
import { reusableItems } from "./template-items";
import { applyTemplateToCourse } from "./webinar-date";

const link = { type: "internal" as const, url: "/services/youtube-management/{courseId}", label: "강사 출연 유튜브 관리" };
const item = { id: "task", title: "유튜브 신청서 강사님 전달", link };

test("연결 주소를 검증하고 템플릿 저장·적용·WBS 저장 후에도 강의별 화면 연결을 보존한다", () => {
  const saved = parseWbsItems([item]);
  const applied = parseWbsItems(applyTemplateToCourse(reusableItems(saved), "2026-10-30"));
  assert.deepEqual(applied.find((row) => row.id === "task")?.link, link);
  assert.equal(taskLinkHref(link, "course/one"), "/services/youtube-management/course%2Fone");
  assert.deepEqual(parseWbsItems([{ ...item, link: { ...link, type: "external", url: "https://example.com/guide?q=1#section" } }])[0].link?.type, "external");
});

test("기존 WBS의 독립 ID도 유일한 제목으로 템플릿 화면을 연결하고 중복 제목은 임의 연결하지 않는다", () => {
  const templates = parseWbsItems([item]);
  const legacy = { id: "independent-id", title: item.title };
  assert.deepEqual(taskLink(legacy, templates), link);
  assert.equal(taskLink(legacy, [...templates, { ...templates[0], id: "other" }]), undefined);
  assert.equal(taskLink({ ...legacy, link: { type: "external", url: "https://example.com", label: "기존 연결" } }, templates)?.label, "기존 연결");
});

test("실행 코드·프로토콜 상대 주소·외부 위장 내부 주소·자격 증명·잘못된 연결은 저장을 거부한다", () => {
  for (const invalid of [
    { ...link, url: "//evil.example" }, { ...link, url: "/%2Fevil.example" },
    { ...link, url: "/\\evil.example" }, { ...link, url: "/%5Cevil.example" },
    { ...link, url: "https://example.com" }, { ...link, url: "/%0A/evil.example" },
    { ...link, type: "external", url: "javascript:alert(1)" },
    { ...link, type: "external", url: "data:text/html,test" },
    { ...link, type: "external", url: "https://user:password@example.com" },
    { ...link, type: "unknown" }, { ...link, label: "" },
  ]) assert.throws(() => parseWbsItems([{ ...item, link: invalid }]), WbsInputError);
});
