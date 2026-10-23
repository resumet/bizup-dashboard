import assert from "node:assert/strict";
import test from "node:test";

import { countWeekdaysInclusive, instagramProgressSummary, instagramUploadSchedule, progressPercentage, webinarDeadlineDateKey } from "./instagram-progress";
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
    editingCompleted: false,
    uploadDate: "",
    uploadCompleted: false,
    uploadedUrl: "",
    dmMaterial: "",
    ...progress,
  };
}

test("웨비나 당일을 서울 날짜 기준 업로드 마감일로 계산한다", () => {
  assert.equal(webinarDeadlineDateKey("2026-11-23T01:00:00.000Z"), "2026-11-23");
});

test("마지막 번호는 웨비나 당일, 앞 번호는 이전 평일로 업로드 일정을 만든다", () => {
  assert.deepEqual(instagramUploadSchedule("2026-11-23T01:00:00.000Z", 4), [
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-23",
  ]);
  assert.deepEqual(instagramUploadSchedule("2026-11-22T01:00:00.000Z", 3), [
    "2026-11-19",
    "2026-11-20",
    "2026-11-22",
  ]);
  const fortyDates = instagramUploadSchedule("2026-11-23T01:00:00.000Z", 40);
  assert.equal(fortyDates.length, 40);
  assert.equal(fortyDates[39], "2026-11-23");
  assert.equal(fortyDates.slice(0, 39).every((dateKey) => {
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }), true);
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
    deadlineDateKey: "2026-10-27",
    remainingWeekdays: 3,
    requiredUploadCount: 0,
    uploadShortfallCount: 0,
    isAtRisk: false,
  });

  assert.equal(instagramProgressSummary([
    material(1), material(2), material(3), material(4),
  ], "2026-10-27T01:00:00.000Z", "2026-10-23").isAtRisk, true);
});

test("오늘부터 마감일까지 평일당 한 건을 올릴 수 있도록 최소 업로드 목표와 부족분을 계산한다", () => {
  const summary = instagramProgressSummary([
    material(1, { uploadCompleted: true }),
    material(2), material(3), material(4), material(5),
  ], "2026-10-27T01:00:00.000Z", "2026-10-23");

  assert.equal(summary.requiredUploadCount, 2);
  assert.equal(summary.uploadShortfallCount, 1);
  assert.equal(summary.isAtRisk, true);
});

test("진행률은 소수점 없이 가장 가까운 정수로 반올림한다", () => {
  assert.equal(progressPercentage(1, 3), 33);
  assert.equal(progressPercentage(2, 3), 67);
  assert.equal(progressPercentage(0, 0), 0);
});
