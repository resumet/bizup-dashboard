import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageBusinessTripReport,
  saveBusinessTripReportSchema,
} from "./model";
import { BUSINESS_TRIP_REPORT_MAX_BYTES, validateBusinessTripFile } from "./file";

test("출장보고서 제목과 최종 비용, 지급 상태를 검증한다", () => {
  assert.deepEqual(saveBusinessTripReportSchema.parse({
    title: "부산 파트너사 미팅",
    finalCost: 125000,
    paymentCompleted: false,
  }), {
    title: "부산 파트너사 미팅",
    finalCost: 125000,
    paymentCompleted: false,
  });
  assert.equal(saveBusinessTripReportSchema.safeParse({ title: "", finalCost: -1, paymentCompleted: false }).success, false);
});

test("작성자와 최고관리자만 출장보고서를 수정할 수 있다", () => {
  assert.equal(canManageBusinessTripReport("author", "author", false), true);
  assert.equal(canManageBusinessTripReport("other", "author", false), false);
  assert.equal(canManageBusinessTripReport("super", "author", true), true);
  assert.equal(canManageBusinessTripReport("other", null, false), false);
});

test("출장보고서 첨부파일 형식과 크기를 제한한다", () => {
  assert.equal(validateBusinessTripFile({
    name: "출장보고서.docx",
    size: 95_000,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }).extension, "docx");
  assert.throws(() => validateBusinessTripFile({ name: "report.exe", size: 10, type: "application/octet-stream" }), /PDF, Word/);
  assert.throws(() => validateBusinessTripFile({ name: "report.pdf", size: BUSINESS_TRIP_REPORT_MAX_BYTES + 1, type: "application/pdf" }), /50MB/);
});
