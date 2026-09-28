import assert from "node:assert/strict";
import test from "node:test";

import { buildWbsDashboard } from "./dashboard";
import type { WbsCourse, WbsItem } from "./types";

function item(id: string, dueDate: string, completed = false, position = 0): WbsItem {
  return { id, title: id, owner: "담당자", stakeholders: "", startDate: "", dueDate, description: "", completed, position };
}

const courses: WbsCourse[] = [
  { id: "later", name: "나중 강의", cohort: "", instructorName: "", webinarAt: "2026-10-20T10:30:00+09:00" },
  { id: "soon", name: "가까운 강의", cohort: "", instructorName: "", webinarAt: "2026-10-10T10:30:00+09:00" },
  { id: "past", name: "지난 강의", cohort: "", instructorName: "", webinarAt: "2026-09-01T10:30:00+09:00" },
];

test("WBS dashboard summarizes progress and proposes the three earliest incomplete tasks", () => {
  const dashboard = buildWbsDashboard([
    { courseId: "later", items: [item("undated", ""), item("second", "2026-10-02"), item("done", "2026-09-01", true)] },
    { courseId: "soon", items: [item("first", "2026-10-01"), item("third", "2026-10-03")] },
  ], courses, new Date("2026-09-28T00:00:00Z"));

  assert.deepEqual({
    savedWbsCount: dashboard.savedWbsCount,
    totalItemCount: dashboard.totalItemCount,
    completedItemCount: dashboard.completedItemCount,
  }, { savedWbsCount: 2, totalItemCount: 5, completedItemCount: 1 });
  assert.deepEqual(dashboard.urgentTasks.map((task) => task.itemId), ["first", "second", "third"]);
});

test("closest unstarted WBS means a saved WBS with no completed work and a future webinar", () => {
  const dashboard = buildWbsDashboard([
    { courseId: "later", items: [item("later-task", "")] },
    { courseId: "soon", items: [item("started-task", "", true)] },
    { courseId: "past", items: [item("past-task", "")] },
  ], courses, new Date("2026-09-28T00:00:00Z"));

  assert.equal(dashboard.closestUnstartedCourseId, "later");
});
