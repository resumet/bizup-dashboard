import assert from "node:assert/strict";
import test from "node:test";

import { countWeekdaysInclusive, instagramProgressSummary, webinarDeadlineDateKey } from "./instagram-progress";
import type { CourseDocumentMaterial } from "./types";

function material(position: number, progress: Partial<CourseDocumentMaterial> = {}): CourseDocumentMaterial {
  return {
    position,
    title: "",
    referencePlanningNumber: "",
    documentId: null,
    planningCompleted: false,
    filmingDate: "",
    filmingCompleted: false,
    uploadDate: "",
    uploadCompleted: false,
    uploadedUrl: "",
    dmMaterial: "",
    ...progress,
  };
}

test("웨비나 전날을 서울 날짜 기준 업로드 마감일로 계산한다", () => {
  assert.equal(webinarDeadlineDateKey("2026-11-23T01:00:00.000Z"), "2026-11-22");
});

test("남은 업로드 가능일은 시작일과 마감일 사이 평일만 센다", () => {
  assert.equal(countWeekdaysInclusive("2026-10-23", "2026-10-26"), 2);
  assert.equal(countWeekdaysInclusive("2026-10-24", "2026-10-25"), 0);
  assert.equal(countWeekdaysInclusive("2026-10-27", "2026-10-26"), 0);
});

test("남은 업로드 건수가 남은 평일보다 많으면 위험 상태를 표시한다", () => {
  const summary = instagramProgressSummary([
    material(1, { planningCompleted: true, filmingCompleted: true, uploadCompleted: true }),
    material(2, { planningCompleted: true, filmingCompleted: true }),
    material(3, { planningCompleted: true }),
  ], "2026-10-27T01:00:00.000Z", "2026-10-23");

  assert.deepEqual(summary, {
    totalCount: 3,
    planningCompletedCount: 3,
    filmingCompletedCount: 2,
    uploadCompletedCount: 1,
    remainingUploadCount: 2,
    deadlineDateKey: "2026-10-26",
    remainingWeekdays: 2,
    isAtRisk: false,
  });

  assert.equal(instagramProgressSummary([
    material(1), material(2), material(3),
  ], "2026-10-27T01:00:00.000Z", "2026-10-23").isAtRisk, true);
});
