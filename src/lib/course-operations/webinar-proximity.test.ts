import assert from "node:assert/strict";
import test from "node:test";

import {
  formatWebinarCountdown,
  sortByNearestWebinar,
} from "./webinar-proximity";

test("무료 웨비나까지 남은 날짜와 지난 날짜를 표시한다", () => {
  assert.equal(
    formatWebinarCountdown("2026-09-21T10:30:00+09:00", "2026-09-07"),
    "(D-14일)",
  );
  assert.equal(
    formatWebinarCountdown("2026-09-07T19:30:00+09:00", "2026-09-07"),
    "(D-Day)",
  );
  assert.equal(
    formatWebinarCountdown("2026-09-04T19:30:00+09:00", "2026-09-07"),
    "(D+3일)",
  );
});

test("예정된 무료 웨비나를 가까운 순서로 두고 지난 일정은 뒤로 보낸다", () => {
  const courses = [
    { name: "지난주", free_webinar_at: "2026-08-31T19:30:00+09:00" },
    { name: "다음주", free_webinar_at: "2026-09-14T19:30:00+09:00" },
    { name: "오늘", free_webinar_at: "2026-09-07T19:30:00+09:00" },
    { name: "내일", free_webinar_at: "2026-09-08T19:30:00+09:00" },
    { name: "어제", free_webinar_at: "2026-09-06T19:30:00+09:00" },
  ];

  assert.deepEqual(
    sortByNearestWebinar(courses, "2026-09-07").map((course) => course.name),
    ["오늘", "내일", "다음주", "어제", "지난주"],
  );
});
