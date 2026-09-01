import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTaskDeadlines,
  getDeadlineProgress,
  getTaskDeadlineDate,
} from "./task-deadlines";
import { createDefaultRequiredTasks } from "./required-tasks";

test("무료 웨비나를 기준으로 필수 작업 데드라인을 4주·2주·1주 전에 정한다", () => {
  assert.equal(
    getTaskDeadlineDate("2026-09-29", "free-webinar-assets"),
    "2026-09-01",
  );
  assert.equal(
    getTaskDeadlineDate("2026-09-29", "paid-course-assets"),
    "2026-09-15",
  );
  assert.equal(
    getTaskDeadlineDate("2026-09-29", "course-materials"),
    "2026-09-22",
  );
});

test("기존 작업의 완료 여부는 유지하면서 데드라인 날짜를 갱신한다", () => {
  const tasks = createDefaultRequiredTasks();
  tasks[0].completed = true;
  const updated = applyTaskDeadlines(tasks, "2026-09-29");
  assert.equal(updated[0].dueDate, "2026-09-01");
  assert.equal(updated[0].completed, true);
});

test("데드라인까지 남은 기간과 지연 기간을 표시한다", () => {
  assert.equal(
    getDeadlineProgress("2026-09-10", false, "2026-09-01").label,
    "D-9 · 9일 남음",
  );
  assert.equal(
    getDeadlineProgress("2026-09-01", false, "2026-09-01").label,
    "D-DAY · 오늘 마감",
  );
  assert.equal(
    getDeadlineProgress("2026-08-30", false, "2026-09-01").label,
    "D+2 · 2일 지남",
  );
  assert.equal(
    getDeadlineProgress("2026-08-30", true, "2026-09-01").label,
    "작업 완료",
  );
});
