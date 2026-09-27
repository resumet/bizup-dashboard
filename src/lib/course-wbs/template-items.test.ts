import assert from "node:assert/strict";
import test from "node:test";

import { reusableItems } from "./template-items";
import type { WbsItem } from "./types";
import { parseWbsItems, parseWbsTemplateBody } from "./validation";
import { applyTemplateToCourse, syncWebinarItem, WEBINAR_ITEM_ID } from "./webinar-date";

test("template save and load retain each task's detailed description", () => {
  const taskDescription = "신청서 내용을 확인한다.\n강사와 담당자에게 수정 사항을 공유한다.";
  const webinarDescription = "방송 링크와 리허설 담당자를 확인한다.";
  const courseItems: WbsItem[] = [
    {
      id: "prepare", title: "웨비나 준비", owner: "담당자", stakeholders: "강사",
      startDate: "2026-09-25", dueDate: "2026-09-26", description: taskDescription,
      completed: true, position: 0,
    },
    {
      id: WEBINAR_ITEM_ID, title: "무료웨비나", owner: "담당자", stakeholders: "강사",
      startDate: "2026-09-28", dueDate: "2026-09-28", description: webinarDescription,
      completed: true, position: 1,
    },
  ];

  const submitted = parseWbsTemplateBody({ name: "공통 WBS", items: reusableItems(courseItems) });
  const saved = parseWbsItems(syncWebinarItem(submitted.items, "2026-09-28"));
  const loaded = parseWbsItems(JSON.parse(JSON.stringify(saved)));
  const applied = applyTemplateToCourse(loaded, "2026-10-05");

  assert.equal(loaded[0].description, taskDescription);
  assert.equal(loaded[1].description, webinarDescription);
  assert.equal(applied[0].description, taskDescription);
  assert.equal(applied[1].description, webinarDescription);
  assert.equal(applied[0].startDate, "2026-10-02");
  assert.equal(applied[1].dueDate, "2026-10-05");
  assert.ok(applied.every((item) => !item.completed));
});
