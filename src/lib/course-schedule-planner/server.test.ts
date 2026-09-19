import assert from "node:assert/strict";
import test from "node:test";

import { reduceCourseScheduleDraftEvents } from "./server";

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
