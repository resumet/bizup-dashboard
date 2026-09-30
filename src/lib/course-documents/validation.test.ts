import assert from "node:assert/strict";
import test from "node:test";

import { adminCourseDocumentSchema, assertValidKoreanPhone, courseDocumentContentSchema, slugBase, splitDocumentAtLeadGate } from "./validation";

test("전화번호는 숫자만 남기고 국내 전화번호 길이를 검증한다", () => {
  assert.equal(assertValidKoreanPhone("010-1234-5678"), "01012345678");
  assert.throws(() => assertValidKoreanPhone("1234"));
});

test("리드게이트는 선택한 블록 다음부터 잠근다", () => {
  const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(splitDocumentAtLeadGate(blocks, true, "b"), {
    publicBlocks: blocks.slice(0, 2),
    lockedBlocks: blocks.slice(2),
  });
});

test("리드게이트는 뒤에 공개할 블록이 남는 위치에만 둘 수 있다", () => {
  const firstId = "00000000-0000-4000-8000-000000000001";
  const lastId = "00000000-0000-4000-8000-000000000002";
  const base = {
    title: "문서",
    status: "published" as const,
    leadGateEnabled: true,
    content: [
      { id: firstId, type: "paragraph" as const, content: "공개" },
      { id: lastId, type: "paragraph" as const, content: "잠금" },
    ],
  };
  assert.equal(adminCourseDocumentSchema.safeParse({ ...base, leadGateAfterBlockId: firstId }).success, true);
  assert.equal(adminCourseDocumentSchema.safeParse({ ...base, leadGateAfterBlockId: lastId }).success, false);
});

test("문서 블록은 중복 UUID와 위험한 URL을 거부한다", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(courseDocumentContentSchema.safeParse([
    { id, type: "paragraph", content: "본문" },
    { id, type: "cta", label: "클릭", url: "javascript:alert(1)" },
  ]).success, false);

test("리치 텍스트 안의 이미지와 링크도 안전한 URL만 허용한다", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(courseDocumentContentSchema.safeParse([{
    id,
    type: "rich_text",
    content: {
      type: "paragraph",
      attrs: { blockId: id },
      content: [{
        type: "text",
        text: "위험한 링크",
        marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
      }],
    },
  }]).success, false);
});
});

test("문서 제목으로 읽을 수 있는 slug 앞부분을 만든다", () => {
  assert.equal(slugBase("Instagram Reels Guide!"), "instagram-reels-guide");
  assert.equal(slugBase("릴스 조회수 올리는 방법"), "document");
});
