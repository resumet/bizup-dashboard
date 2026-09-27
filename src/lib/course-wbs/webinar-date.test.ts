import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "./types";
import {
  applyTemplateToCourse,
  syncWebinarItem,
  WEBINAR_ITEM_ID,
  webinarDateFromTimestamp,
  webinarDayLabel,
} from "./webinar-date";

function item(partial: Partial<WbsItem> = {}): WbsItem {
  return {
    id: "task-1", title: "준비", owner: "", stakeholders: "", startDate: "",
    dueDate: "", description: "", completed: false, position: 0, ...partial,
  };
}

test("강의 상세 일시를 한국 날짜로 읽고 일정의 웨비나 기준 일수를 표시한다", () => {
  assert.equal(webinarDateFromTimestamp("2026-09-27T15:00:00Z"), "2026-09-28");
  assert.equal(webinarDateFromTimestamp(null), "");
  assert.equal(webinarDayLabel("2025-12-31", "2026-01-02"), "D-2");
  assert.equal(webinarDayLabel("2026-01-02", "2026-01-02"), "D-Day");
  assert.equal(webinarDayLabel("2026-01-04", "2026-01-02"), "D+2");
  assert.equal(webinarDayLabel("2026-02-30", "2026-03-01"), "");
  assert.equal(webinarDayLabel("", "2026-03-01"), "");
});

test("기존 무료웨비나 항목을 보존하며 강의 상세 날짜로 동기화한다", () => {
  const original = [
    item({ id: "first", position: 0 }),
    item({ id: "old-anchor", title: "무료웨비나", owner: "담당자", completed: true, dueDate: "2026-09-01", position: 1 }),
    item({ id: WEBINAR_ITEM_ID, title: "무료웨비나", position: 2 }),
  ];
  const synced = syncWebinarItem(original, "2026-09-28");
  assert.equal(synced.length, 2);
  assert.equal(synced[1].id, WEBINAR_ITEM_ID);
  assert.equal(synced[1].dueDate, "2026-09-28");
  assert.equal(synced[1].startDate, "2026-09-28");
  assert.equal(original[1].dueDate, "2026-09-01");

  const migrated = syncWebinarItem(original.slice(0, 2), "2026-09-28");
  assert.equal(migrated[1].id, WEBINAR_ITEM_ID);
  assert.equal(migrated[1].owner, "담당자");
  assert.equal(migrated[1].completed, true);
  const added = syncWebinarItem([item()], "2026-09-28");
  assert.deepEqual(added.map((row) => row.position), [0, 1]);
  assert.equal(added[0].id, WEBINAR_ITEM_ID);
});

test("띄어 쓴 무료 웨비나 항목도 기존 기준일로 사용하고 중복을 만들지 않는다", () => {
  const template = [
    item({ id: "legacy-webinar", title: "무료 웨비나", owner: "진행자", dueDate: "2026-09-28" }),
    item({ id: "prep", title: "준비", dueDate: "2026-09-27", position: 1 }),
  ];
  const applied = applyTemplateToCourse(template, "2026-10-05");
  assert.equal(applied.length, 2);
  assert.equal(applied[0].id, WEBINAR_ITEM_ID);
  assert.equal(applied[0].title, "무료웨비나");
  assert.equal(applied[0].owner, "진행자");
  assert.equal(applied[0].dueDate, "2026-10-05");
  assert.equal(applied[1].dueDate, "2026-10-04");
});

test("템플릿 일정은 다른 강의의 무료웨비나 날짜로 일수만큼 이동한다", () => {
  const template = [
    item({ id: WEBINAR_ITEM_ID, title: "무료웨비나", startDate: "2024-03-01", dueDate: "2024-03-01" }),
    item({ id: "prep", title: "준비", startDate: "2024-02-27", dueDate: "2024-02-29", position: 1 }),
    item({ id: "after", title: "정리", dueDate: "2024-03-03", position: 2 }),
  ];
  const applied = applyTemplateToCourse(template, "2025-03-01");
  assert.equal(applied[0].dueDate, "2025-03-01");
  assert.equal(applied[1].startDate, "2025-02-26");
  assert.equal(applied[1].dueDate, "2025-02-28");
  assert.equal(applied[2].dueDate, "2025-03-03");
  assert.equal(webinarDayLabel(applied[1].dueDate, applied[0].dueDate), "D-1");
  assert.equal(template[1].dueDate, "2024-02-29");
});
