import assert from "node:assert/strict";
import test from "node:test";
import { countYoutubeAppearances, groupYoutubeCourses, YOUTUBE_COURSE_GROUPS } from "./course-list";

test("유튜브 관리 강의를 진행중·완료·취소·보류 순서로 나누고 진행중만 기본으로 연다", () => {
  assert.deepEqual(YOUTUBE_COURSE_GROUPS, [
    { key: "ongoing", label: "진행중", defaultOpen: true },
    { key: "completed", label: "완료", defaultOpen: false },
    { key: "canceled", label: "취소", defaultOpen: false },
    { key: "on_hold", label: "보류", defaultOpen: false },
  ]);
  const courses = [
    { id: "ongoing", status: "ongoing" },
    { id: "legacy-active", status: "active" },
    { id: "planned", status: "planned" },
    { id: "completed", status: "completed" },
    { id: "canceled", status: "canceled" },
    { id: "on-hold", status: "on_hold" },
  ];
  const grouped = groupYoutubeCourses(courses);
  assert.deepEqual(grouped.ongoing.map(({ id }) => id), ["ongoing", "legacy-active", "planned"]);
  assert.deepEqual(grouped.completed.map(({ id }) => id), ["completed"]);
  assert.deepEqual(grouped.canceled.map(({ id }) => id), ["canceled"]);
  assert.deepEqual(grouped.on_hold.map(({ id }) => id), ["on-hold"]);
});

test("출연 확정 채널 수에는 확정 상태만 집계하며 빈 목록은 0개로 표시한다", () => {
  assert.deepEqual(countYoutubeAppearances([
    { request_status: "confirmed" }, { request_status: "planned" },
    { request_status: "requested" }, { request_status: "declined" },
    { request_status: "confirmed" },
  ]), { appearanceCount: 5, confirmedAppearanceCount: 2 });
  assert.deepEqual(countYoutubeAppearances([]), { appearanceCount: 0, confirmedAppearanceCount: 0 });
});
