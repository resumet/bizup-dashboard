import assert from "node:assert/strict";
import test from "node:test";

import { formatDashboardCohort, formatDashboardWebinarDate } from "./course-metadata";

test("대시보드 웨비나 날짜를 한국 날짜와 요일로 표시한다", () => {
  assert.equal(formatDashboardWebinarDate("2026-11-29T19:30:00+09:00"), "2026년 11월 29일(일)");
  assert.equal(formatDashboardWebinarDate("2026-11-28T16:00:00Z"), "2026년 11월 29일(일)");
  assert.equal(formatDashboardWebinarDate(null), "—");
  assert.equal(formatDashboardWebinarDate("invalid"), "—");
});

test("대시보드 기수에 기 단위를 한 번만 붙인다", () => {
  assert.equal(formatDashboardCohort("1"), "1기");
  assert.equal(formatDashboardCohort(" 2기 "), "2기");
  assert.equal(formatDashboardCohort(""), "기수 미정");
});
