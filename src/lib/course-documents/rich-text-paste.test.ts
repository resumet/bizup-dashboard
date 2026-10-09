import assert from "node:assert/strict";
import test from "node:test";

import { notionCalloutPasteDocument } from "./rich-text-paste";
import { richTextDocumentToBlocks } from "./rich-text";
import { courseDocumentContentSchema } from "./validation";

test("노션에서 텍스트로 복사한 콜아웃의 태그를 숨기고 이모지, 굵기, 줄바꿈을 보존한다", () => {
  const document = notionCalloutPasteDocument(
    '<aside>\r\n🔍\r\n**체크** — 이 제목만 보고 처음 방문한 사람이 “여기에 어떤 정보가 있겠구나”라고 예상할 수 있는가?\r\nYES라면 사용해도 좋습니다.\r\n</aside>',
  );
  assert.ok(document);
  assert.deepEqual(document.content, [{
    type: "blockquote",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "🔍" }] },
      { type: "paragraph", content: [
        { type: "text", text: "체크", marks: [{ type: "bold" }] },
        { type: "text", text: " — 이 제목만 보고 처음 방문한 사람이 “여기에 어떤 정보가 있겠구나”라고 예상할 수 있는가?" },
      ] },
      { type: "paragraph", content: [{ type: "text", text: "YES라면 사용해도 좋습니다." }] },
    ],
  }]);
  const blocks = richTextDocumentToBlocks(document);
  assert.equal(courseDocumentContentSchema.safeParse(blocks).success, true);
  assert.deepEqual(blocks[0]?.type === "rich_text" ? blocks[0].content.content : null, document.content[0].content);
});

test("콜아웃 앞뒤 내용과 여러 콜아웃의 순서를 유지한다", () => {
  const document = notionCalloutPasteDocument('**원문**\n<aside>첫 번째</aside>\n중간\n<aside class="callout">**두 번째**</aside>\n끝');
  assert.ok(document);
  assert.deepEqual(document.content.map((node) => node.type), ["paragraph", "blockquote", "paragraph", "blockquote", "paragraph"]);
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
  assert.equal(document.content.filter((node) => node.type === "blockquote").length, 1);
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
  assert.equal(document.content[0].content?.[0].content?.[0].text, "<script>alert(1)</script>");
  assert.equal(document.content[0].content?.[1].content?.[0].text, "<img src=x onerror=alert(1)>");
});
