import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardCoursePreparation } from "./course-preparation";
import type { InstagramPreparationInput } from "./instagram-preparation";
import type { WbsCourse, WbsScheduleItem } from "@/lib/course-wbs/types";
import type { YoutubePreparationSummary } from "./youtube-preparation";

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

test("WBS와 인스타그램 운영을 합쳐 전체 준비도와 달성 가능성을 계산한다", () => {
  const instagram = new Map<string, InstagramPreparationInput>([["combined", {
    configured: true,
    totalContentCount: 1,
    materials: [{ position: 1, planningCompleted: true, filmingCompleted: true, editingCompleted: false, uploadCompleted: false }],
    checklistTotalCount: 2,
    checklistCompletedCount: 1,
  }]]);
  const result = buildDashboardCoursePreparation(
    [course("combined")],
    [{ courseId: "combined", items: [task("finished", "2026-10-01", "2026-10-10", true)] }],
    [],
    "2026-10-31",
    instagram,
  );

  assert.equal(result[0].wbsProgress, 100);
  assert.equal(result[0].instagram?.progress, 50);
  assert.equal(result[0].progress, 75);
  assert.equal(result[0].status, "normal");
});

test("인스타그램 운영 미설정은 주의, 업로드 일정 지연은 위험으로 표시한다", () => {
  const instagram = new Map<string, InstagramPreparationInput>([
    ["not-configured", { configured: false, totalContentCount: 0, materials: [], checklistTotalCount: 2, checklistCompletedCount: 0 }],
    ["at-risk", {
      configured: true,
      totalContentCount: 2,
      materials: [
        { position: 1, planningCompleted: true, filmingCompleted: true, editingCompleted: true, uploadCompleted: false },
        { position: 2, planningCompleted: true, filmingCompleted: false, editingCompleted: false, uploadCompleted: false },
      ],
      checklistTotalCount: 0,
      checklistCompletedCount: 0,
    }],
  ]);
  const courses = [
    { ...course("not-configured"), webinarAt: "2026-11-30T19:30:00+09:00" },
    { ...course("at-risk"), webinarAt: "2026-11-01T19:30:00+09:00" },
  ];
  const schedules = courses.map((item) => ({ courseId: item.id, items: [task("future", "2026-11-20", "2026-11-21")] }));
  const result = buildDashboardCoursePreparation(courses, schedules, [], "2026-10-31", instagram);

  assert.equal(result.find((item) => item.id === "not-configured")?.status, "warning");
  assert.equal(result.find((item) => item.id === "at-risk")?.status, "danger");
  assert.equal(result.find((item) => item.id === "at-risk")?.instagram?.uploadShortfallCount, 1);
});

test("관리자 기준을 넘긴 유튜브 촬영 일정 미확정 강의를 위험으로 표시한다", () => {
  const youtube = new Map<string, YoutubePreparationSummary>([["youtube-risk", {
    appearanceCount: 3,
    confirmedAppearanceCount: 2,
    filmingConfirmedCount: 1,
    uploadCompletedCount: 1,
    filmingAlertCount: 1,
    filmingAlertWeeks: 4,
  }]]);
  const result = buildDashboardCoursePreparation(
    [course("youtube-risk")],
    [{ courseId: "youtube-risk", items: [task("future", "2026-11-20", "2026-11-21")] }],
    [],
    "2026-10-31",
    undefined,
    youtube,
  );

  assert.equal(result[0].status, "danger");
  assert.deepEqual(result[0].youtube, youtube.get("youtube-risk"));
});
