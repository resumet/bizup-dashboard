import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRowsText, schedulesForItem, startDateTone } from "./item-schedules";
import type { WbsCourse, WbsScheduleItem } from "./types";

const courses: WbsCourse[] = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id, cohort: "1", instructorName: "강사", webinarAt: "2026-12-14T11:00:00Z", status: "ongoing" }));
const item: WbsScheduleItem = { id: "planning", title: "자료 기획", owner: "담당자", startDate: "2026-12-01", dueDate: "2026-12-03", completed: false };

test("compares stored start dates, matching shared IDs before titles and independent tasks by title", () => {
  const rows = schedulesForItem(courses, [
    { courseId: "a", items: [{ ...item, title: "변경한 제목", startDate: "2026-12-05" }] },
    { courseId: "b", items: [{ ...item, id: "independent", title: " 자료   기획 " }] },
    { courseId: "c", items: [{ ...item, startDate: "", completed: true }] },
    { courseId: "d", items: [] },
  ], item, "2026-10-08");
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
  const rows = schedulesForItem(courses.slice(0, 1), [{ courseId: "a", items: [{ ...item, id: "one" }, { ...item, id: "two" }] }], item, "2026-10-08");
  assert.equal(rows[0].item, undefined);
});

test("지난 웨비나와 완료 상태 강의는 시작 일정에서 제외한다", () => {
  const scoped: WbsCourse[] = [
    { ...courses[0], id: "past", webinarAt: "2026-10-07T11:00:00Z" },
    { ...courses[0], id: "today", webinarAt: "2026-10-08T11:00:00Z" },
    { ...courses[0], id: "future", webinarAt: "2026-10-13T11:00:00Z" },
    { ...courses[0], id: "completed", webinarAt: "2026-10-13T11:00:00Z", status: "completed" },
  ];
  const rows = schedulesForItem(scoped, [], item, "2026-10-08");
  assert.deepEqual(rows.map((row) => row.course.id), ["today", "future"]);
});

test("오늘까지 지난 시작일은 빨간색, 향후 5일 이내는 노란색 대상으로 분류한다", () => {
  assert.equal(startDateTone("2026-10-07", "2026-10-08"), "overdue");
  assert.equal(startDateTone("2026-10-08", "2026-10-08"), "overdue");
  assert.equal(startDateTone("2026-10-13", "2026-10-08"), "soon");
  assert.equal(startDateTone("2026-10-14", "2026-10-08"), null);
});

test("표시된 강의명, 강사명, 웨비나일과 시작일을 한 번에 복사할 텍스트로 만든다", () => {
  const copyCourses: WbsCourse[] = [
    { ...courses[0], id: "meaning", name: "AI 인스타 대행 수익화 공식", instructorName: "미닝", webinarAt: "2026-10-13T11:00:00Z" },
    { ...courses[0], id: "global", name: "샤오홍슈와 틱톡글로벌을 이용한 AI인플루언서 수익화", instructorName: "김선아", webinarAt: "2026-11-29T11:00:00Z" },
  ];
  const rows = schedulesForItem(copyCourses, [
    { courseId: "meaning", items: [{ ...item, startDate: "2026-09-01" }] },
    { courseId: "global", items: [{ ...item, startDate: "2026-10-19" }] },
  ], item, "2026-08-01");
  assert.equal(scheduleRowsText("광고영상촬영진행", rows), [
    "광고영상촬영진행",
    "",
    "1. AI 인스타 대행 수익화 공식/미닝/10월 13일/9월 1일",
    "2. 샤오홍슈와 틱톡글로벌을 이용한 AI인플루언서 수익화/김선아/11월 29일/10월 19일",
  ].join("\n"));
});
