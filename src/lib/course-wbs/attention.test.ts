import assert from "node:assert/strict";
import test from "node:test";
import { buildWbsAttention, wbsProgress } from "./attention";
import type { WbsCourse, WbsScheduleItem } from "./types";

const course = (id: string, status: WbsCourse["status"] = "ongoing"): WbsCourse => ({ id, name: id, cohort: "1", instructorName: "강사", status, webinarAt: "2026-10-30T19:30:00+09:00" });
const task = (id: string, startDate: string, dueDate: string, completed = false): WbsScheduleItem => ({ id, title: id, owner: "", startDate, dueDate, completed });

test("미진행은 지난 기한의 미완료 업무만 세고 오늘 마감·진행 중·완료·일정 미정을 구분한다", () => {
  const items = [task("overdue", "", "2026-10-17"), task("start-only", "2026-10-17", ""), task("today", "", "2026-10-18"), task("active", "2026-10-17", "2026-10-20"), task("done", "", "2026-10-16", true), task("undated", "", "")];
  assert.deepEqual(wbsProgress(items, "2026-10-18"), { total: 6, remaining: 5, completed: 1, progress: 17, overdue: 2 });
  assert.deepEqual(wbsProgress([], "2026-10-18"), { total: 0, remaining: 0, completed: 0, progress: 0, overdue: 0 });
});

test("미진행·오늘 마감·진행 필요·일정 미정·예정 순으로 우선 처리 사유와 전체 개수를 제공한다", () => {
  const items = [task("upcoming", "2026-10-23", "2026-11-10"), task("undated", "", ""), task("active", "2026-10-17", "2026-10-20"), task("today", "", "2026-10-18"), task("late-newer", "", "2026-10-17"), task("late-older", "", "2026-10-01"), task("later", "2026-11-01", "2026-11-02"), task("completed", "", "2026-10-01", true)];
  const result = buildWbsAttention([course("a")], [{ courseId: "a", items }], "2026-10-18");
  assert.deepEqual(result.tasks.map(({ item }) => item.id), ["late-older", "late-newer", "today", "active", "undated", "upcoming"]);
  assert.deepEqual(result.counts, { overdue: 2, today: 1, missing: 0, active: 1, undated: 1, upcoming: 1 });
  assert.equal(result.tasks[0].reason, "마감일 17일 경과");
  const many = buildWbsAttention([course("a")], [{ courseId: "a", items: Array.from({ length: 25 }, (_, i) => task(String(i), "", "2026-10-01")) }], "2026-10-18");
  assert.equal(many.counts.overdue, 25);
});

test("템플릿 일정상 지금 필요한 누락 업무를 찾고 독립 ID의 동일 제목·향후 업무는 중복 경고하지 않는다", () => {
  const template = parseTemplate([
    task("course-free-webinar", "2026-10-30", "2026-10-30"),
    task("missing", "2026-10-17", "2026-10-20"),
    task("present", "2026-10-17", "2026-10-20"),
    task("future", "2026-10-21", "2026-10-25"),
  ]);
  const result = buildWbsAttention([course("a"), course("b", "on_hold")], [{ courseId: "a", items: [task("course-free-webinar", "2026-10-30", "2026-10-30"), { ...task("independent", "2026-10-17", "2026-10-20"), title: "present" }] }], "2026-10-18", template);
  assert.deepEqual(result.tasks.filter((row) => row.category === "missing").map(({ item }) => item.id), ["missing"]);
  assert.equal(result.counts.missing, 1);
});

function parseTemplate(items: WbsScheduleItem[]) {
  return items.map((item, position) => ({ ...item, description: "", stakeholders: "", position }));
}

test("요약은 진행 강의만 다루고 WBS 미등록·빈 WBS 강의를 날짜순 입력 순서대로 안내한다", () => {
  const courses = [course("missing"), course("empty"), course("saved"), course("paused", "on_hold"), course("done", "completed"), course("canceled", "canceled")];
  const result = buildWbsAttention(courses, [
    { courseId: "empty", items: [] }, { courseId: "saved", items: [task("today", "", "2026-10-18")] },
    { courseId: "paused", items: [task("old", "", "2026-10-01")] },
  ], "2026-10-18");
  assert.deepEqual(result.missingWbs.map(({ id }) => id), ["missing", "empty"]);
  assert.deepEqual(result.tasks.map(({ course }) => course.id), ["saved"]);
});
