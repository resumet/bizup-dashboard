import assert from "node:assert/strict";
import test from "node:test";
import { schedulesForItem } from "./item-schedules";
import type { WbsCourse, WbsScheduleItem } from "./types";

const courses: WbsCourse[] = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id, cohort: "1", instructorName: "강사", webinarAt: "2026-12-14T11:00:00Z" }));
const item: WbsScheduleItem = { id: "planning", title: "자료 기획", owner: "담당자", startDate: "2026-12-01", dueDate: "2026-12-03", completed: false };

test("compares stored start dates, matching shared IDs before titles and independent tasks by title", () => {
  const rows = schedulesForItem(courses, [
    { courseId: "a", items: [{ ...item, title: "변경한 제목", startDate: "2026-12-05" }] },
    { courseId: "b", items: [{ ...item, id: "independent", title: " 자료   기획 " }] },
    { courseId: "c", items: [{ ...item, startDate: "", completed: true }] },
    { courseId: "d", items: [] },
  ], item);
  assert.deepEqual(rows.map((row) => row.course.id), ["b", "a", "c", "d", "e"]);
  assert.equal(rows[0].item?.owner, "담당자");
  assert.equal(rows[1].item?.startDate, "2026-12-05");
  assert.equal(rows[2].item?.startDate, ""); // A due date is never substituted for a start date.
  assert.equal(rows[2].item?.completed, true);
  assert.equal(rows[3].hasWbs, true);
  assert.equal(rows[3].item, undefined);
  assert.equal(rows[4].hasWbs, false);
});

test("does not pick an arbitrary task when multiple independent tasks have the same title", () => {
  const rows = schedulesForItem(courses.slice(0, 1), [{ courseId: "a", items: [{ ...item, id: "one" }, { ...item, id: "two" }] }], item);
  assert.equal(rows[0].item, undefined);
});
