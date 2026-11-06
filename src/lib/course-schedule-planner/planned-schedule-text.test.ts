import assert from "node:assert/strict";
import test from "node:test";

import { buildPlannedScheduleText } from "./planned-schedule-text";

test("오늘부터의 예정·확정 강의를 날짜순 텍스트로 정리한다", () => {
  const text = buildPlannedScheduleText({
    today: "2026-11-06",
    drafts: [
      { id: "past", instructorName: "지난 강사", topic: "지난 강의", memo: "", courseSize: "small", colorIndex: 0, scheduledDate: "2026-11-05", createdAt: "", updatedAt: "" },
      { id: "draft", instructorName: "예정 강사", topic: "예정 강의", memo: "", courseSize: "large", colorIndex: 0, scheduledDate: "2026-11-10", createdAt: "", updatedAt: "" },
    ],
    confirmedCourses: [
      { id: "confirmed", name: "확정 강의", instructorName: "확정 강사", cohort: "2기", webinarDate: "2026-11-06" },
    ],
  });

  assert.equal(text, [
    "예정 강의 일정",
    "",
    "2026년 11월 6일 (금)",
    "- 확정 · 확정 강의 · 확정 강사 · 2기",
    "",
    "2026년 11월 10일 (화)",
    "- 예정 · 예정 강의 · 예정 강사 · 대형 강의",
  ].join("\n"));
});

test("현재 일정 이후의 강의가 없으면 빈 상태를 안내한다", () => {
  assert.equal(buildPlannedScheduleText({
    today: "2026-11-06",
    drafts: [],
    confirmedCourses: [],
  }), "현재 일정 이후로 예정된 강의가 없습니다.");
});
