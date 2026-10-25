import assert from "node:assert/strict";
import test from "node:test";

import { mergeTemplateItems } from "./template-items";
import type { WbsItem } from "./types";
import { WEBINAR_ITEM_ID } from "./webinar-date";

function item(id: string, title: string, position: number, partial: Partial<WbsItem> = {}): WbsItem {
  return {
    id,
    title,
    owner: "",
    stakeholders: "",
    startDate: "",
    dueDate: "",
    description: "",
    completed: false,
    position,
    ...partial,
  };
}

test("템플릿 동기화는 완료 체크를 유지하고 추가·삭제·내용 변경을 반영한다", () => {
  const existing = [
    item("prepare", "기존 자료 준비", 0, { completed: true, owner: "기존 담당자", description: "이전 설명" }),
    item("deleted", "삭제할 업무", 1, { completed: true }),
    item(WEBINAR_ITEM_ID, "무료웨비나", 2, { completed: true, startDate: "2026-10-20", dueDate: "2026-10-20" }),
  ];
  const template = [
    item("prepare", "기존 자료 및 기획", 0, { owner: "새 담당자", description: "최신 설명" }),
    item("added", "새로 추가한 업무", 1),
    item(WEBINAR_ITEM_ID, "무료웨비나", 2, { startDate: "2026-10-20", dueDate: "2026-10-20" }),
  ];

  const merged = mergeTemplateItems(existing, template, "2026-11-03");

  assert.deepEqual(merged.map((entry) => entry.id), ["prepare", "added", WEBINAR_ITEM_ID]);
  assert.equal(merged[0].completed, true);
  assert.equal(merged[0].title, "기존 자료 및 기획");
  assert.equal(merged[0].owner, "새 담당자");
  assert.equal(merged[0].description, "최신 설명");
  assert.equal(merged[1].completed, false);
  assert.equal(merged[2].completed, true);
  assert.equal(merged[2].dueDate, "2026-11-03");
});

test("기존 임의 ID 항목은 제목으로 연결한 뒤 템플릿 ID로 안정화한다", () => {
  const existing = [
    item("legacy-random-id", "촬영 일정 확정", 0, { completed: true }),
    item(WEBINAR_ITEM_ID, "무료웨비나", 1),
  ];
  const template = [
    item("filming-schedule", "촬영 일정 확정", 0, { owner: "콘텐츠팀" }),
    item(WEBINAR_ITEM_ID, "무료웨비나", 1),
  ];

  const merged = mergeTemplateItems(existing, template, "");
  const filming = merged.find((entry) => entry.id === "filming-schedule");

  assert.equal(filming?.completed, true);
  assert.equal(filming?.owner, "콘텐츠팀");
});

test("기존 임의 ID의 제목까지 바뀐 경우 동일 길이 목록의 위치로 완료 상태를 유지한다", () => {
  const existing = [
    item("legacy-a", "기존 제목 A", 0, { completed: true }),
    item("legacy-b", "기존 제목 B", 1, { completed: false }),
    item(WEBINAR_ITEM_ID, "무료웨비나", 2),
  ];
  const template = [
    item("stable-a", "변경된 제목 A", 0),
    item("stable-b", "변경된 제목 B", 1),
    item(WEBINAR_ITEM_ID, "무료웨비나", 2),
  ];

  const merged = mergeTemplateItems(existing, template, "");

  assert.deepEqual(
    merged.filter((entry) => entry.id !== WEBINAR_ITEM_ID).map((entry) => entry.completed),
    [true, false],
  );
  assert.deepEqual(
    merged.filter((entry) => entry.id !== WEBINAR_ITEM_ID).map((entry) => entry.id),
    ["stable-a", "stable-b"],
  );
});
