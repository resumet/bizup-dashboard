import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultInstagramChecklistTemplateItems,
  instagramChecklistSummary,
  instagramChecklistTemplateItemsSchema,
  mergeInstagramChecklistState,
} from "./instagram-checklist";

test("인스타그램 체크리스트는 요청한 기본 7개 항목을 순서대로 제공한다", () => {
  assert.deepEqual(defaultInstagramChecklistTemplateItems().map((item) => item.title), [
    "계정 로그인 완료했는지",
    "블루뱃지 받았나요?",
    "강사님이 영상 업로드해주신 것 확인했나요?",
    "강사님 1차 촬영 일자 확정했나요?",
    "강사님 2차 촬영 일자 확정했나요?",
    "강사님 3차 촬영 일자 확정했나요?",
    "강사님 4차 촬영 일자 확정했나요?",
  ]);
});

test("공용 템플릿과 강의별 완료 상태를 병합한다", () => {
  const template = defaultInstagramChecklistTemplateItems();
  const items = mergeInstagramChecklistState(template, ["blue-badge", "filming-date-2", "deleted-item"]);
  assert.equal(items.find((item) => item.id === "blue-badge")?.completed, true);
  assert.equal(items.find((item) => item.id === "filming-date-2")?.completed, true);
  assert.equal(items.find((item) => item.id === "account-login")?.completed, false);
  assert.equal(items.some((item) => item.id === "deleted-item"), false);
});

test("전체·완료·미완료 수와 진행률을 계산한다", () => {
  const items = mergeInstagramChecklistState(defaultInstagramChecklistTemplateItems(), [
    "account-login",
    "blue-badge",
  ]);

  assert.deepEqual(instagramChecklistSummary(items), {
    totalCount: 7,
    completedCount: 2,
    incompleteCount: 5,
    progressPercentage: 29,
  });
  assert.deepEqual(instagramChecklistSummary([]), {
    totalCount: 0,
    completedCount: 0,
    incompleteCount: 0,
    progressPercentage: 0,
  });
});

test("템플릿은 빈 제목과 중복 ID를 거부한다", () => {
  assert.equal(instagramChecklistTemplateItemsSchema.safeParse([{ id: "one", title: "" }]).success, false);
  assert.equal(instagramChecklistTemplateItemsSchema.safeParse([
    { id: "one", title: "첫 번째" },
    { id: "one", title: "두 번째" },
  ]).success, false);
});
