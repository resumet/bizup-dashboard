import assert from "node:assert/strict";
import test from "node:test";

import { PDFDocument } from "pdf-lib";

import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  renderInstructorContractTemplate,
} from "./instructor-contract";
import {
  createInstructorContractPdf,
  instructorContractPdfFilename,
} from "./instructor-contract-pdf";

test("계약서 PDF는 A4로 생성하고 회사 대표자란에 법인 인감을 포함한다", async () => {
  const renderedContent = renderInstructorContractTemplate(DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE, {
    instructorName: "홍길동",
    lectureName: "테스트 강의",
    instagramNumberOfReels: "",
    instagramValueOfReels: "",
    contractDate: "2026-11-06",
    startDate: "2026-11-06",
    durationYears: 1,
    address: "",
    phone: "",
    email: "",
  });
  const bytes = await createInstructorContractPdf({ title: "홍길동 - 테스트 강의 계약서", renderedContent });
  const pdf = await PDFDocument.load(bytes);
  const firstPage = pdf.getPages()[0];

  assert.ok(pdf.getPageCount() >= 1);
  assert.ok(Math.abs(firstPage.getWidth() - 595.28) < 0.1);
  assert.ok(Math.abs(firstPage.getHeight() - 841.89) < 0.1);
  assert.match(instructorContractPdfFilename({ title: "홍길동/테스트" }), /홍길동_테스트_계약서\.pdf$/u);
  assert.match(Buffer.from(bytes).toString("latin1"), /\/Subtype \/Image/u);
});

