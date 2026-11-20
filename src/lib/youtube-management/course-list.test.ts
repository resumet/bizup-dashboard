import assert from "node:assert/strict";
import test from "node:test";
import { countYoutubeAppearances, groupYoutubeCourses, orderedChannelChips, YOUTUBE_COURSE_GROUPS } from "./course-list";

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

test("출연 확정은 확정 상태만, 업로드 완료는 업로드 일정이 있는 항목만 집계한다", () => {
  assert.deepEqual(countYoutubeAppearances([
    { request_status: "confirmed", upload_date: "2026-11-01" },
    { request_status: "planned", upload_date: null },
    { request_status: "requested", upload_date: "2026-11-02" },
    { request_status: "declined" },
    { request_status: "confirmed", upload_date: null },
  ]), { appearanceCount: 5, confirmedAppearanceCount: 2, uploadCompletedCount: 2 });
  assert.deepEqual(countYoutubeAppearances([]), { appearanceCount: 0, confirmedAppearanceCount: 0, uploadCompletedCount: 0 });
});
test("출연 불가만 뒤로 보내고 같은 채널에 진행 중인 신청이 있으면 채널색을 유지한다", () => {
  const channels = [
    { name: "가", confirmed: false, declined: true },
    { name: "나", confirmed: false, declined: true },
    { name: "다", confirmed: false, declined: false },
    { name: " 가 ", confirmed: true, declined: false },
    { name: "라", confirmed: false, declined: true },
  ];
  assert.deepEqual(orderedChannelChips(channels), [
    { name: "다", declined: false }, { name: "가", declined: false },
    { name: "나", declined: true }, { name: "라", declined: true },
  ]);
});
