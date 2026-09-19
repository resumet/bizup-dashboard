import assert from "node:assert/strict";
import test from "node:test";
import { isCarriedTask, taskAppearsOnWorkday } from "./dates";
import type { WorkTask } from "./types";

function task(overrides: Partial<WorkTask>): WorkTask {
  return {
    id: "task-1",
    title: "업무",
    description: "",
    planned_date: "2026-09-18",
    status: "open",
    creator_id: "user-1",
    assignee_id: "user-1",
    completed_at: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

test("전날 미완료 업무는 다음날 이월되고 과거 완료·미래 업무는 제외된다", () => {
  const today = "2026-09-19";
  const carried = task({});
  const completedYesterday = task({ status: "done", completed_at: "2026-09-18T08:00:00.000Z" });
  const completedToday = task({ status: "done", completed_at: "2026-09-19T01:00:00.000Z" });
  const future = task({ planned_date: "2026-09-20" });

  assert.equal(taskAppearsOnWorkday(carried, today), true);
  assert.equal(isCarriedTask(carried, today), true);
  assert.equal(taskAppearsOnWorkday(completedYesterday, today), false);
  assert.equal(taskAppearsOnWorkday(completedToday, today), true);
  assert.equal(taskAppearsOnWorkday(future, today), false);
});
