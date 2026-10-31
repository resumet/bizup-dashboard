import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardCoursePreparation } from "./course-preparation";
import type { WbsCourse, WbsScheduleItem } from "@/lib/course-wbs/types";

function course(id: string, status: WbsCourse["status"] = "ongoing"): WbsCourse {
  return {
    id,
    name: `${id} 강의`,
    cohort: "1",
    instructorName: "강사",
    status,
    webinarAt: "2026-11-30T19:30:00+09:00",
  };
}

function task(id: string, startDate: string, dueDate: string, completed = false): WbsScheduleItem {
  return { id, title: id, owner: "담당자", startDate, dueDate, completed };
}

test("진행 강의의 준비도와 위험 신호를 계산하고 위험도 안에서는 입력 순서를 유지한다", () => {
  const result = buildDashboardCoursePreparation(
    [course("normal-first"), course("danger-first"), course("danger-second"), course("normal-second"), course("done", "completed")],
    [
      { courseId: "normal-first", items: [task("future", "2026-11-20", "2026-11-21")] },
      { courseId: "danger-first", items: [task("late", "2026-10-01", "2026-10-10")] },
      { courseId: "normal-second", items: [task("finished", "2026-10-01", "2026-10-10", true)] },
      { courseId: "done", items: [task("ignored", "2026-10-01", "2026-10-10")] },
    ],
    [],
    "2026-10-31",
  );

  assert.deepEqual(result.map(({ id }) => id), ["danger-first", "danger-second", "normal-first", "normal-second"]);
  assert.equal(result[0].overdueCount, 1);
  assert.equal(result[0].status, "danger");
  assert.equal(result[1].wbsMissing, true);
  assert.equal(result[2].status, "normal");
  assert.equal(result[3].status, "complete");
  assert.equal(result[3].progress, 100);
});

test("가장 시급한 업무를 우선 보여주고 먼 미래 업무도 다음 업무로 제공한다", () => {
  const result = buildDashboardCoursePreparation(
    [course("attention"), course("planned")],
    [
      { courseId: "attention", items: [task("today", "", "2026-10-31"), task("late", "", "2026-10-20")] },
      { courseId: "planned", items: [task("later", "2026-12-10", "2026-12-12"), task("sooner", "2026-11-20", "2026-11-21")] },
    ],
    [],
    "2026-10-31",
  );

  assert.equal(result.find(({ id }) => id === "attention")?.nextTask?.id, "late");
  assert.equal(result.find(({ id }) => id === "attention")?.nextTask?.category, "overdue");
  assert.equal(result.find(({ id }) => id === "planned")?.nextTask?.id, "sooner");
  assert.equal(result.find(({ id }) => id === "planned")?.nextTask?.category, "planned");
});

test("템플릿에서 이미 시작됐지만 저장되지 않은 업무를 등록 누락으로 표시한다", () => {
  const template = [{
    ...task("missing", "2026-10-20", "2026-11-01"),
    description: "",
    stakeholders: "",
    position: 0,
  }];
  const result = buildDashboardCoursePreparation(
    [course("template-gap")],
    [{ courseId: "template-gap", items: [task("saved", "2026-11-20", "2026-11-21")] }],
    template,
    "2026-10-31",
  );

  assert.equal(result[0].missingCount, 1);
  assert.equal(result[0].status, "danger");
  assert.equal(result[0].nextTask?.id, "missing");
});
