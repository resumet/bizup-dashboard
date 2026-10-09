import assert from "node:assert/strict";
import test from "node:test";

import { createCallout, inlineNodeText } from "./callout";
import { normalizeNotionCalloutNodes, notionCalloutPasteDocument } from "./rich-text-paste";
import { blocksToRichTextDocument, repairCourseDocumentCallouts, richTextDocumentToBlocks } from "./rich-text";
import { courseDocumentContentSchema } from "./validation";
import type { RichTextNode } from "./types";

const paragraph = (text: string): RichTextNode => ({ type: "paragraph", content: [{ type: "text", text }] });

test("사용자가 제공한 이스케이프·공백 엔티티·목록형 aside를 아이콘과 실제 목록으로 변환한다", () => {
  const source = String.raw`\<aside>\
&#x20;❌

**열어봐야 아는 이름**

- INFO
- STORY
- 처음이라면
- 이것저것
- 소식
- Daily\
  &#x20;\</aside>`;
  const document = notionCalloutPasteDocument(source);
  assert.ok(document);
  assert.equal(document.content.length, 1);
  const callout = document.content[0];
  assert.equal(callout.type, "callout");
  assert.equal(callout.attrs?.icon, "❌");
  assert.deepEqual(callout.content?.[0].content?.[0], { type: "text", text: "열어봐야 아는 이름", marks: [{ type: "bold" }] });
  assert.equal(callout.content?.[1].type, "bulletList");
  assert.deepEqual(callout.content?.[1].content?.map(inlineNodeText), ["INFO", "STORY", "처음이라면", "이것저것", "소식", "Daily"]);
  assert.doesNotMatch(JSON.stringify(document), /aside|&#x20;|\\\\/u);
  assert.equal(courseDocumentContentSchema.safeParse(richTextDocumentToBlocks(document)).success, true);
});

test("닫는 aside가 마지막 목록 항목 안에 있어도 전체 콜아웃을 복구한다", () => {
  const nodes: RichTextNode[] = [
    paragraph("<aside>"), paragraph("❌"), paragraph("**열어봐야 아는 이름**"),
    { type: "bulletList", content: [
      { type: "listItem", content: [paragraph("INFO")] },
      { type: "listItem", content: [paragraph("Daily\\"), paragraph(" &#x20;\\</aside>")] },
    ] },
    paragraph("다음 문단"),
  ];
  const normalized = normalizeNotionCalloutNodes(nodes);
  assert.equal(normalized[0].type, "callout");
  assert.equal(normalized[0].attrs?.icon, "❌");
  assert.equal(normalized[0].content?.[1].type, "bulletList");
  assert.deepEqual(normalized[0].content?.[1].content?.map(inlineNodeText), ["INFO", "Daily"]);
  assert.equal(inlineNodeText(normalized[1]), "다음 문단");
  assert.doesNotMatch(JSON.stringify(normalized), /aside|&#x20;/u);
});

test("이모지가 별도 문단 또는 본문 첫 줄에 있어도 왼쪽 아이콘으로 분리한다", () => {
  for (const content of [
    [paragraph("⚠️"), paragraph("앱 버전에 따라 다릅니다.")],
    [paragraph("⚠️ 앱 버전에 따라 다릅니다.")],
    [paragraph("⚠️\n앱 버전에 따라 다릅니다.")],
  ]) {
    const callout = createCallout(content);
    assert.equal(callout.attrs?.icon, "⚠️");
    assert.equal(inlineNodeText(callout.content![0]), "앱 버전에 따라 다릅니다.");
  }
  assert.equal(createCallout([paragraph("👩‍💻 본문")]).attrs?.icon, "👩‍💻");
});

test("이전 버전이 만든 이모지 인용문을 콜아웃으로 복구하고 일반 인용문은 보존한다", () => {
  const legacy: RichTextNode = { type: "blockquote", content: [paragraph("⚠️"), paragraph("본문")] };
  const quote: RichTextNode = { type: "blockquote", content: [paragraph("일반 인용문")] };
  const normalized = normalizeNotionCalloutNodes([legacy, quote]);
  assert.equal(normalized[0].type, "callout");
  assert.equal(normalized[0].attrs?.icon, "⚠️");
  assert.equal(normalized[1], quote);
  assert.equal(normalizeNotionCalloutNodes(normalized), normalized);
});

test("콜아웃에서 링크, 중첩 목록, 번호 목록, 체크 항목과 코드 블록을 유지한다", () => {
  const document = notionCalloutPasteDocument('<aside>\n💡\n[링크](https://example.com)와 *기울임*\n\n1. 첫째\n2. 둘째\n   - 중첩\n\n- [x] 완료\n- [ ] 미완료\n\n```html\n<aside>코드 예시</aside>\n```\n</aside>');
  assert.ok(document);
  const body = document.content[0].content!;
  assert.deepEqual(body.map((node) => node.type), ["paragraph", "orderedList", "taskList", "codeBlock"]);
  assert.equal(body[0].content?.some((node) => node.marks?.some((mark) => mark.type === "link")), true);
  assert.equal(body[1].content?.[1].content?.[1].type, "bulletList");
  assert.deepEqual(body[2].content?.map((node) => node.attrs?.checked), [true, false]);
  assert.equal(inlineNodeText(body[3]), "<aside>코드 예시</aside>");
});

test("콜아웃 아이콘과 내용, 식별자를 저장 후 다시 열어도 보존한다", () => {
  const blocks = richTextDocumentToBlocks({ content: [createCallout([paragraph("❌"), paragraph("본문")])] });
  assert.equal(courseDocumentContentSchema.safeParse(blocks).success, true);
  assert.deepEqual(richTextDocumentToBlocks(blocksToRichTextDocument(blocks)), blocks);
  assert.equal(repairCourseDocumentCallouts(blocks), blocks);
  const defaults: RichTextNode[] = [{ type: "callout", attrs: { icon: "💡", blockId: null }, content: [
    { type: "paragraph", attrs: { textAlign: null, blockId: null }, content: [{ type: "text", text: "본문" }] },
    { type: "paragraph", attrs: { textAlign: "center", blockId: null }, content: [{ type: "text", text: "가운데 정렬" }] },
  ] }];
  assert.equal(normalizeNotionCalloutNodes(defaults), defaults);
  // Tiptap serializes marks before text; object key order must not mark saved content dirty.
  const tiptap: RichTextNode[] = [{ type: "callout", attrs: { icon: "❌" }, content: [
    { type: "paragraph", attrs: { textAlign: null, blockId: null }, content: [{ type: "text", marks: [{ type: "bold" }], text: "제목" }] },
    { type: "bulletList", attrs: { blockId: null }, content: [{ type: "listItem", content: [paragraph("INFO")] }] },
  ] }];
  assert.equal(normalizeNotionCalloutNodes(tiptap), tiptap);
});

test("Markdown 콜아웃의 위험한 URL은 링크로 만들지 않고 아이콘 길이를 검증한다", () => {
  const document = notionCalloutPasteDocument('<aside>[클릭](javascript:alert(1))</aside>');
  assert.ok(document);
  assert.doesNotMatch(JSON.stringify(document), /"type":"link"/u);
  const blocks = richTextDocumentToBlocks({ content: [{ type: "callout", attrs: { icon: "a".repeat(65) }, content: [paragraph("본문")] }] });
  assert.equal(courseDocumentContentSchema.safeParse(blocks).success, false);
});
