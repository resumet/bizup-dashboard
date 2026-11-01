import assert from "node:assert/strict";
import test from "node:test";

import { buildInstagramPreparationSummary, type InstagramPreparationInput } from "./instagram-preparation";

function input(overrides: Partial<InstagramPreparationInput> = {}): InstagramPreparationInput {
  return {
    configured: true,
    totalContentCount: 2,
    materials: [
      { position: 1, planningCompleted: true, filmingCompleted: true, editingCompleted: true, uploadCompleted: true },
      { position: 2, planningCompleted: true, filmingCompleted: false, editingCompleted: false, uploadCompleted: false },
    ],
    checklistTotalCount: 2,
    checklistCompletedCount: 1,
    ...overrides,
  };
}

test("콘텐츠 4단계와 체크리스트를 합쳐 인스타그램 운영 진행률을 계산한다", () => {
  const summary = buildInstagramPreparationSummary(input(), "2026-11-30T19:30:00+09:00", "2026-11-01");

  assert.equal(summary.completedStepCount, 6);
  assert.equal(summary.totalStepCount, 10);
  assert.equal(summary.progress, 60);
  assert.equal(summary.uploadCompletedCount, 1);
  assert.equal(summary.checklistCompletedCount, 1);
});

test("웨비나까지 필요한 업로드 수보다 완료 수가 적으면 달성 위험으로 판정한다", () => {
  const summary = buildInstagramPreparationSummary(input({
    totalContentCount: 3,
    materials: [
      { position: 1, planningCompleted: true, filmingCompleted: true, editingCompleted: true, uploadCompleted: true },
      { position: 2, planningCompleted: true, filmingCompleted: false, editingCompleted: false, uploadCompleted: false },
      { position: 3, planningCompleted: false, filmingCompleted: false, editingCompleted: false, uploadCompleted: false },
    ],
  }), "2026-11-03T19:30:00+09:00", "2026-11-03");

  assert.equal(summary.uploadShortfallCount, 1);
  assert.equal(summary.isAtRisk, true);
});

test("운영 미설정 상태는 진행률과 완료 상태를 0으로 유지한다", () => {
  const summary = buildInstagramPreparationSummary(input({ configured: false }), "2026-11-30T19:30:00+09:00", "2026-11-01");

  assert.equal(summary.progress, 0);
  assert.equal(summary.isComplete, false);
});
