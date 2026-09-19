import assert from "node:assert/strict";
import test from "node:test";

import { loadKoreanHolidays, reduceCourseScheduleDraftEvents } from "./server";

test("예비 강의 이벤트에서 최신 일정과 삭제 상태를 복원한다", () => {
  const base = {
    instructorName: "김강사",
    topic: "첫 강의",
    colorIndex: 2,
    scheduledDate: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
  const drafts = reduceCourseScheduleDraftEvents([
    { entity_id: "a", event_type: "course_schedule_draft.upserted", metadata: base, created_at: base.createdAt },
    { entity_id: "a", event_type: "course_schedule_draft.upserted", metadata: { ...base, scheduledDate: "2026-10-08", updatedAt: "2026-09-20T00:00:00.000Z" }, created_at: "2026-09-20T00:00:00.000Z" },
    { entity_id: "b", event_type: "course_schedule_draft.upserted", metadata: { ...base, topic: "삭제 강의" }, created_at: base.createdAt },
    { entity_id: "b", event_type: "course_schedule_draft.deleted", metadata: {}, created_at: "2026-09-21T00:00:00.000Z" },
  ]);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, "a");
  assert.equal(drafts[0].scheduledDate, "2026-10-08");
});

test("한국 공휴일은 설날·추석 연휴와 대체공휴일을 포함한다", async () => {
  const holidays = await loadKoreanHolidays([2026]);
  assert.deepEqual(holidays["2026-02-16"], ["설날 전날"]);
  assert.deepEqual(holidays["2026-02-17"], ["설날"]);
  assert.deepEqual(holidays["2026-02-18"], ["설날 다음 날"]);
  assert.ok(holidays["2026-03-02"].some((name) => name.includes("대체공휴일")));
});
