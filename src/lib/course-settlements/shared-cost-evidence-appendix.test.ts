import assert from "node:assert/strict";
import test from "node:test";
import type { CourseCost } from "@/lib/course-costs/types";
import { sharedCostEvidenceAppendixHtml } from "./shared-cost-evidence-appendix";

function cost(input: Partial<CourseCost>): CourseCost {
  return {
    id: "cost-1", courseId: "course-1", categoryCode: "CUSTOM", name: "메타광고비", burdenType: "SHARED",
    managerUserId: null, managerName: "홍길동", grossAmount: 120000, supplyAmount: 109091, vatAmount: 10909,
    taxType: "TAXABLE", paidDate: "2026-10-29", status: "PAID", evidenceRequired: false, evidenceNeedsReview: false,
    evidenceTypes: [], otherEvidenceType: "", companyShareRate: 50, instructorShareRate: 50, companyShareAmount: 60000,
    instructorShareAmount: 60000, includeInSettlement: true, note: "", migratedFrom: null, version: 1,
    createdBy: "", createdAt: "", updatedBy: "", updatedAt: "",
    attachments: [{ id: "image-1", originalName: "영수증.png", mimeType: "image/png", size: 100, uploadedAt: "", uploadedBy: "", storagePath: "", url: "https://example.com/image.png?a=1&b=2" }],
    ...input,
    calculationDetails: input.calculationDetails ?? null,
  };
}

test("공동 부담 증빙만 정산 PDF 마지막 부록 형식으로 만든다", () => {
  const html = sharedCostEvidenceAppendixHtml([
    cost({ name: "광고비 <10월>", managerName: "김&박", grossAmount: 123456 }),
    cost({ id: "company", burdenType: "COMPANY", name: "회사 비용" }),
  ]);
  assert.match(html, /회사·강사 공동 부담 첨부파일/u);
  assert.match(html, /광고비 &lt;10월&gt;\(김&amp;박\) - 123,456원/u);
  assert.match(html, /<img class="evidence-image"/u);
  assert.match(html, /a=1&amp;b=2/u);
  assert.doesNotMatch(html, /회사 비용/u);
});

test("PDF는 문서 영역과 열기 링크를 제공하고 증빙이 없으면 부록을 만들지 않는다", () => {
  const html = sharedCostEvidenceAppendixHtml([cost({ attachments: [{ id: "pdf-1", originalName: "계약서.pdf", mimeType: "application/pdf", size: 100, uploadedAt: "", uploadedBy: "", storagePath: "", url: "https://example.com/file.pdf" }] })]);
  assert.match(html, /<object class="evidence-pdf"/u);
  assert.match(html, /계약서.pdf 열기/u);
  assert.equal(sharedCostEvidenceAppendixHtml([cost({ attachments: [] })]), "");
});
