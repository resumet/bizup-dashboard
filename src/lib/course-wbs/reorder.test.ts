import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "./types";
import { reorderWbsItems } from "./reorder";

const items = ["webinar", "a", "b", "c"].map((id, position): WbsItem => ({
  id, title: id, owner: "", stakeholders: "", startDate: "", dueDate: "",
  description: "", completed: false, position,
}));

test("dragging WBS rows in either direction updates persisted positions", () => {
  const down = reorderWbsItems(items, "a", "c", "after");
  assert.deepEqual(down?.map((item) => [item.id, item.position]),
    [["webinar", 0], ["b", 1], ["c", 2], ["a", 3]]);

  const up = reorderWbsItems(items, "c", "a", "before");
  assert.deepEqual(up?.map((item) => [item.id, item.position]),
    [["webinar", 0], ["c", 1], ["a", 2], ["b", 3]]);

  assert.deepEqual(reorderWbsItems(items, "webinar", "b", "after")?.map((item) => item.id),
    ["a", "b", "webinar", "c"]);
  assert.equal(reorderWbsItems(items, "a", "b", "before"), null);
  assert.equal(reorderWbsItems(items, "missing", "b", "before"), null);
});
