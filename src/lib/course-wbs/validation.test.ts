import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WBS_TEMPLATE } from "./default-template";
import {
  parseWbsExpectedUpdatedAt,
  parseWbsItems,
  parseWbsTemplateBody,
  WbsInputError,
} from "./validation";

const item = { id: "task-1", title: "웨비나 준비", position: 0 };

test("WBS 항목의 날짜와 완료 상태를 저장 가능한 형태로 검증한다", () => {
  assert.deepEqual(parseWbsItems([{ ...item, startDate: "2026-09-27", dueDate: "2026-09-28", deliverable: "Legacy result", completed: true }]), [{
    ...item,
    owner: "",
    stakeholders: "",
    startDate: "2026-09-27",
    dueDate: "2026-09-28",
    description: "",
    completed: true,
  }]);
  for (const invalid of [
    [{ ...item, startDate: "2026-09-28", dueDate: "2026-09-27" }],
    [{ ...item, dueDate: "2026-02-30" }],
    [{ ...item, completed: "true" }],
    [item, item],
    [{ ...item, title: "" }],
    [{ ...item, title: "x".repeat(201) }],
    Array.from({ length: 501 }, (_, index) => ({ ...item, id: `task-${index}` })),
  ]) {
    assert.throws(() => parseWbsItems(invalid), WbsInputError);
  }
});

test("저장 기준 시각은 최초 생성의 null 또는 서버 시각 문자열이어야 한다", () => {
  assert.equal(parseWbsExpectedUpdatedAt({ expectedUpdatedAt: null }), null);
  assert.equal(
    parseWbsExpectedUpdatedAt({ expectedUpdatedAt: "2026-09-27T12:34:56.123456+00:00" }),
    "2026-09-27T12:34:56.123456+00:00",
  );
  for (const invalid of [{}, { expectedUpdatedAt: "" }, { expectedUpdatedAt: 42 }, { expectedUpdatedAt: "yesterday" }]) {
    assert.throws(() => parseWbsExpectedUpdatedAt(invalid), WbsInputError);
  }
});

test("Notion 기본 템플릿은 고유한 항목 ID로 시작하고 수정 입력을 받을 수 있다", () => {
  const initial = parseWbsItems(DEFAULT_WBS_TEMPLATE.items);
  assert.equal(initial.length, 22);
  assert.equal(new Set(initial.map((row) => row.id)).size, initial.length);
  assert.ok(initial.every((row) => !row.startDate && !row.dueDate));
  assert.ok(initial.every((row) => !("deliverable" in row)));
  const upgraded = parseWbsTemplateBody({
    name: "강의 준비 템플릿 2판",
    items: [{ ...initial[0], completed: true }, ...initial.slice(1)],
  });
  assert.equal(upgraded.items[0].completed, true);
  assert.equal(upgraded.items.length, initial.length);
});
