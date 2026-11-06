import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { createSignedInstructorContractPdf } from "./instructor-contract-pdf";
import { signPublicInstructorContractSchema } from "./instructor-contract-validation";

test("전자계약 서명은 PNG 서명과 동의 여부를 검증한다", () => {
  const input = {
    signerName: "홍길동",
    method: "seal" as const,
    signatureImageData: "data:image/png;base64,iVBORw0KGgo=",
    agreed: true as const,
  };
  assert.equal(signPublicInstructorContractSchema.parse(input).method, "seal");
  assert.throws(() => signPublicInstructorContractSchema.parse({ ...input, agreed: false }), /동의/u);
  assert.throws(() => signPublicInstructorContractSchema.parse({ ...input, signatureImageData: "https://example.com/sign.png" }), /서명 이미지/u);
});

test("완료된 전자계약은 도장이 포함된 A4 PDF로 생성된다", async () => {
  const pdf = await createSignedInstructorContractPdf({
    title: "홍길동 - 테스트 강의 계약서",
    renderedContent: [{ id: "00000000-0000-4000-8000-000000000001", type: "paragraph", content: "계약서 본문" }],
    signingStatus: "completed",
    signerName: "홍길동",
    signerMethod: "seal",
    signatureImageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL2NwAAAABJRU5ErkJggg==",
    signedAt: "2026-11-06T00:00:00.000Z",
  });
  const parsed = await PDFDocument.load(pdf);
  assert.equal(parsed.getPageCount(), 1);
  assert.deepEqual(parsed.getPage(0).getSize(), { width: 595.28, height: 841.89 });
});
