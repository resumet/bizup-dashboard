import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNotionCalloutNodes, notionCalloutPasteDocument } from "./rich-text-paste";
import { blocksToRichTextDocument, repairCourseDocumentCallouts, richTextDocumentToBlocks } from "./rich-text";
import type { RichTextNode } from "./types";
import { courseDocumentContentSchema } from "./validation";

test("노션에서 텍스트로 복사한 콜아웃의 태그를 숨기고 이모지, 굵기, 줄바꿈을 보존한다", () => {
  const document = notionCalloutPasteDocument(
    '<aside>\r\n🔍\r\n**체크** — 이 제목만 보고 처음 방문한 사람이 “여기에 어떤 정보가 있겠구나”라고 예상할 수 있는가?\r\nYES라면 사용해도 좋습니다.\r\n</aside>',
  );
  assert.ok(document);
  assert.deepEqual(document.content, [{
    type: "callout",
    attrs: { icon: "🔍" },
    content: [
      { type: "paragraph", content: [
        { type: "text", text: "체크", marks: [{ type: "bold" }] },
        { type: "text", text: " — 이 제목만 보고 처음 방문한 사람이 “여기에 어떤 정보가 있겠구나”라고 예상할 수 있는가?" },
        { type: "hardBreak" },
        { type: "text", text: "YES라면 사용해도 좋습니다." },
      ] },
    ],
  }]);
  const blocks = richTextDocumentToBlocks(document);
  assert.equal(courseDocumentContentSchema.safeParse(blocks).success, true);
  assert.deepEqual(blocks[0]?.type === "rich_text" ? blocks[0].content.content : null, document.content[0].content);
});

test("콜아웃 앞뒤 내용과 여러 콜아웃의 순서를 유지한다", () => {
  const document = notionCalloutPasteDocument('**원문**\n<aside>첫 번째</aside>\n중간\n<aside class="callout">**두 번째**</aside>\n끝');
  assert.ok(document);
  assert.deepEqual(document.content.map((node) => node.type), ["paragraph", "callout", "paragraph", "callout", "paragraph"]);
  assert.equal(document.content[0].content?.[0].text, "**원문**");
  assert.equal(document.content[2].content?.[0].text, "중간");
  assert.equal(document.content[4].content?.[0].text, "끝");
});

test("일반 텍스트와 닫히지 않은 태그는 자동 변환하지 않는다", () => {
  for (const text of ["", "일반 텍스트\n**강조**", "<aside>미완성", "</aside>", "<div>일반 HTML</div>"]) {
    assert.equal(notionCalloutPasteDocument(text), null);
  }
});

test("코드 예시 안의 aside는 그대로 두고 실제 콜아웃만 변환한다", () => {
  for (const text of [
    "`<aside>예시</aside>`",
    "```html\n<aside>예시</aside>\n```",
    "~~~html\n<aside>예시</aside>\n~~~",
    "```html\n<aside>닫히지 않은 코드</aside>",
  ]) assert.equal(notionCalloutPasteDocument(text), null);

  const document = notionCalloutPasteDocument("```html\n<aside>예시</aside>\n```\n<aside>본문 `**코드**`와 **강조**</aside>");
  assert.ok(document);
  assert.equal(document.content.filter((node) => node.type === "callout").length, 1);
  assert.deepEqual(document.content.at(-1)?.content?.[0].content, [
    { type: "text", text: "본문 " },
    { type: "text", text: "**코드**", marks: [{ type: "code" }] },
    { type: "text", text: "와 " },
    { type: "text", text: "강조", marks: [{ type: "bold" }] },
  ]);
});

test("콜아웃 안의 임의 HTML은 실행 가능한 노드로 바꾸지 않는다", () => {
  const document = notionCalloutPasteDocument('<aside><script>alert(1)</script>\n<img src=x onerror=alert(1)>\n**체크**</aside>');
  assert.ok(document);
  assert.match(JSON.stringify(document), /<script>alert\(1\)<\/script>/u);
  assert.match(JSON.stringify(document), /<img src=x onerror=alert\(1\)>/u);
  assert.doesNotMatch(JSON.stringify(document), /"type":"image"/u);
});

test("HTML 서식과 섞인 문자 태그를 변환할 때 제목, 링크, 굵은 글씨, 목록을 유지한다", () => {
  const heading: RichTextNode = { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] };
  const bold: RichTextNode = { type: "paragraph", content: [{ type: "text", text: "체크", marks: [{ type: "bold" }] }] };
  const link: RichTextNode = { type: "paragraph", content: [{ type: "text", text: "출처", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] };
  const list: RichTextNode = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "항목" }] }] }] };
  const normalized = normalizeNotionCalloutNodes([
    heading,
    { type: "paragraph", content: [{ type: "text", text: "<aside>" }] },
    bold, link, list,
    { type: "paragraph", content: [{ type: "text", text: "</aside>" }] },
    heading,
  ]);
  assert.deepEqual(normalized, [heading, { type: "callout", attrs: { icon: "💡" }, content: [bold, link, list] }, heading]);
  assert.equal(normalizeNotionCalloutNodes(normalized), normalized);
});

test("태그가 여러 텍스트 노드로 나뉘어도 주변 문구와 서식을 보존한다", () => {
  const normalized = normalizeNotionCalloutNodes([{
    type: "paragraph",
    content: [
      { type: "text", text: "앞 <as" },
      { type: "text", text: "ide>**체크**", marks: [{ type: "italic" }] },
      { type: "text", text: "</aside> 뒤" },
    ],
  }]);
  assert.equal(normalized[0].content?.[0].text, "앞 ");
  assert.equal(normalized[1].type, "callout");
  assert.deepEqual(normalized[1].content?.[0].content?.[0], { type: "text", text: "체크", marks: [{ type: "italic" }, { type: "bold" }] });
  assert.equal(normalized[2].content?.[0].text, " 뒤");
});

test("이스케이프한 노션 태그와 HTML 엔티티 태그도 콜아웃으로 변환한다", () => {
  for (const text of ["\\<aside>\n**체크**\n\\</aside>", "&lt;aside&gt;\n**체크**\n&lt;/aside&gt;"]) {
    const document = notionCalloutPasteDocument(text);
    assert.ok(document);
    assert.equal(document.content.length, 1);
    assert.deepEqual(document.content[0].content?.[0].content?.[0].marks, [{ type: "bold" }]);
  }
});

test("저장된 태그를 작성창에서 복구한 뒤 저장하고 다시 열어도 같은 내용을 유지한다", () => {
  const broken = richTextDocumentToBlocks({ content: [
    { type: "paragraph", content: [{ type: "text", text: "<aside>" }] },
    { type: "paragraph", content: [{ type: "text", text: "🔍 **체크**" }] },
    { type: "paragraph", content: [{ type: "text", text: "</aside>" }] },
  ] });
  const repaired = repairCourseDocumentCallouts(broken);
  assert.equal(courseDocumentContentSchema.safeParse(repaired).success, true);
  assert.equal(repaired[0].id, broken[0].id);
  assert.equal(repaired[0].type === "rich_text" ? repaired[0].content.type : null, "callout");
  const reopened = blocksToRichTextDocument(repaired);
  assert.deepEqual(richTextDocumentToBlocks(reopened), repaired);
  assert.equal(repairCourseDocumentCallouts(repaired), repaired);
});

test("이미 저장된 코드 예시와 닫히지 않은 태그는 복구 대상으로 보지 않는다", () => {
  for (const nodes of [
    [{ type: "codeBlock", content: [{ type: "text", text: "<aside>코드</aside>" }] }],
    [{ type: "paragraph", content: [{ type: "text", text: "<aside>코드</aside>", marks: [{ type: "code" }] }] }],
    [{ type: "paragraph", content: [{ type: "text", text: "`<aside>코드</aside>`" }] }],
    [{ type: "paragraph", content: [{ type: "text", text: "<aside>미완성" }] }],
  ] as RichTextNode[][]) assert.equal(normalizeNotionCalloutNodes(nodes), nodes);
});
