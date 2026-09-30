import assert from "node:assert/strict";
import test from "node:test";

import type { CourseDocumentBlock } from "./types";
import { courseDocumentContentSchema } from "./validation";
import { blocksToRichTextDocument, richTextCharacterCount, richTextDocumentToBlocks } from "./rich-text";

test("기존 블록을 리치 텍스트로 바꿀 때 식별자와 내용을 보존한다", () => {
  const blocks: CourseDocumentBlock[] = [
    { id: "00000000-0000-4000-8000-000000000001", type: "heading1", content: "큰 제목" },
    { id: "00000000-0000-4000-8000-000000000002", type: "paragraph", content: "본문" },
    { id: "00000000-0000-4000-8000-000000000003", type: "link", label: "비즈업", url: "https://example.com" },
    { id: "00000000-0000-4000-8000-000000000004", type: "image", url: "https://example.com/image.webp", alt: "예시" },
  ];

  const document = blocksToRichTextDocument(blocks);
  const converted = richTextDocumentToBlocks(document);

  assert.deepEqual(converted.map((block) => block.id), blocks.map((block) => block.id));
  assert.equal(courseDocumentContentSchema.safeParse(converted).success, true);
  assert.equal(richTextCharacterCount(converted), 9);
});

test("내용 없는 편집기는 빈 문서로 저장한다", () => {
  const document = blocksToRichTextDocument([]);
  assert.deepEqual(richTextDocumentToBlocks(document), []);
});

test("빈 표와 체크박스도 문서 내용으로 보존한다", () => {
  const tableId = "00000000-0000-4000-8000-000000000005";
  const taskId = "00000000-0000-4000-8000-000000000006";
  const converted = richTextDocumentToBlocks({
    content: [
      {
        type: "table",
        attrs: { blockId: tableId },
        content: [{
          type: "tableRow",
          content: [{
            type: "tableCell",
            attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
            content: [{ type: "paragraph" }],
          }],
        }],
      },
      {
        type: "taskList",
        attrs: { blockId: taskId },
        content: [{
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph" }],
        }],
      },
    ],
  });

  assert.deepEqual(converted.map((block) => block.id), [tableId, taskId]);
  assert.equal(courseDocumentContentSchema.safeParse(converted).success, true);
});
