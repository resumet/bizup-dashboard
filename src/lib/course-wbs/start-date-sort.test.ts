import assert from "node:assert/strict";
import test from "node:test";

import { sortWbsItemsByStartDate } from "./start-date-sort";
import type { WbsItem } from "./types";

function item(id: string, startDate: string, position: number): WbsItem {
  return {
    id,
    title: id,
    owner: "",
    stakeholders: "",
    startDate,
    dueDate: "",
    description: "",
    completed: false,
    position,
  };
}

test("sorts WBS items by start date and keeps unscheduled items last", () => {
  const result = sortWbsItemsByStartDate([
    item("no-date", "", 0),
    item("later", "2026-10-10", 2),
    item("same-date-second", "2026-10-01", 3),
    item("earlier", "2026-09-30", 1),
    item("same-date-first", "2026-10-01", 0),
  ]);

  assert.deepEqual(result.map((entry) => entry.id), [
    "earlier",
    "same-date-first",
    "same-date-second",
    "later",
    "no-date",
  ]);
});
