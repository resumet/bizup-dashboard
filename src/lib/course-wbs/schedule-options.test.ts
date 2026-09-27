import assert from "node:assert/strict";
import test from "node:test";

import {
  datesForStartOffset,
  dueDateForStartDate,
  WBS_START_OFFSETS,
} from "./schedule-options";

test("the start offset menu runs from 12 to 1 weeks, then 6 to 1 days", () => {
  assert.equal(WBS_START_OFFSETS.length, 18);
  assert.deepEqual(WBS_START_OFFSETS.slice(0, 12).map((option) => option.daysBefore),
    [84, 77, 70, 63, 56, 49, 42, 35, 28, 21, 14, 7]);
  assert.deepEqual(WBS_START_OFFSETS.slice(12).map((option) => option.daysBefore),
    [6, 5, 4, 3, 2, 1]);
  assert.equal(WBS_START_OFFSETS[0].label, "12주 전");
  assert.equal(WBS_START_OFFSETS[17].label, "1일 전");
});

test("week offsets set the due date to the next calendar day", () => {
  assert.deepEqual(datesForStartOffset("2026-10-01", 84), {
    startDate: "2026-07-09", dueDate: "2026-07-10",
  });
  assert.deepEqual(datesForStartOffset("2026-01-02", 7), {
    startDate: "2025-12-26", dueDate: "2025-12-27",
  });
});

test("day offsets use the same start and due date, including a leap day", () => {
  assert.deepEqual(datesForStartOffset("2026-10-01", 6), {
    startDate: "2026-09-25", dueDate: "2026-09-25",
  });
  assert.deepEqual(datesForStartOffset("2024-03-01", 1), {
    startDate: "2024-02-29", dueDate: "2024-02-29",
  });
});

test("manual start dates use the same rule relative to the webinar", () => {
  assert.equal(dueDateForStartDate("2026-09-25", "2026-10-01"), "2026-09-25");
  assert.equal(dueDateForStartDate("2026-09-24", "2026-10-01"), "2026-09-25");
  assert.equal(dueDateForStartDate("2026-10-01", "2026-10-01"), "2026-10-02");
  assert.equal(dueDateForStartDate("2026-10-02", "2026-10-01"), "2026-10-03");
});

test("invalid or missing dates and offsets do not produce a schedule", () => {
  assert.equal(datesForStartOffset("", 7), null);
  assert.equal(datesForStartOffset("2026-02-30", 7), null);
  assert.equal(datesForStartOffset("2026-10-01", 0), null);
  assert.equal(datesForStartOffset("2026-10-01", 1.5), null);
  assert.equal(datesForStartOffset("2026-10-01", Number.NaN), null);
  assert.equal(dueDateForStartDate("", "2026-10-01"), "");
  assert.equal(dueDateForStartDate("2026-02-30", "2026-10-01"), "");
  assert.equal(dueDateForStartDate("2026-10-01", ""), "2026-10-02");
});
