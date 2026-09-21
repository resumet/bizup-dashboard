import assert from "node:assert/strict";
import test from "node:test";

import {
  loadKoreanHolidays,
  parseDraftMemo,
  toCourseScheduleDraft,
} from "./server";

test("예비 강의 DB 행을 화면 데이터로 변환한다", () => {
  const draft = toCourseScheduleDraft({
    id: "4f226db8-202a-4b6b-acad-56e61da3f631",
    instructor_name: "김강사",
    topic: "첫 강의",
    memo: "초기 메모",
    course_size: "small",
    color_index: 2,
    scheduled_date: "2026-10-08",
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
  });
  assert.deepEqual(draft, {
    id: "4f226db8-202a-4b6b-acad-56e61da3f631",
    instructorName: "김강사",
    topic: "첫 강의",
    memo: "초기 메모",
    courseSize: "small",
    colorIndex: 2,
    scheduledDate: "2026-10-08",
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  });
});

test("예비 강의 메모는 공백을 정리하고 비우거나 수정할 수 있다", () => {
  assert.equal(parseDraftMemo("  다음 기수 검토  "), "다음 기수 검토");
  assert.equal(parseDraftMemo("   "), "");
  assert.throws(
    () => parseDraftMemo("가".repeat(5_001)),
    /최대 5,000자/u,
  );
});

test("한국 공휴일은 설날·추석 연휴와 대체공휴일을 포함한다", async () => {
  const holidays = await loadKoreanHolidays([2026]);
  assert.deepEqual(holidays["2026-02-16"], ["설날 전날"]);
  assert.deepEqual(holidays["2026-02-17"], ["설날"]);
  assert.deepEqual(holidays["2026-02-18"], ["설날 다음 날"]);
  assert.ok(holidays["2026-03-02"].some((name) => name.includes("대체공휴일")));
});
