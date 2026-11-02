import assert from "node:assert/strict";
import test from "node:test";

import {
  formatYoutubeFilmingDeadline,
  getYoutubeFilmingAlert,
  YOUTUBE_FILMING_ALERT_DAYS,
} from "./filming-alert";

const webinarAt = "2026-12-07T19:30:00+09:00";

test("무료강의 5주 전부터 거절되지 않은 촬영 일정 미확정 건을 알린다", () => {
  const appearances = [
    { request_status: "planned", filming_confirmed: false, filming_date: null },
    { request_status: "requested", filming_confirmed: false, filming_date: null },
    { request_status: "confirmed", filming_confirmed: true, filming_date: "2026-11-10" },
    { request_status: "declined", filming_confirmed: false, filming_date: null },
  ];

  assert.equal(YOUTUBE_FILMING_ALERT_DAYS, 35);
  assert.deepEqual(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-01"), {
    alertCount: 0,
    deadlineDate: "2026-11-02",
    deadlineReached: false,
    unconfirmedCount: 2,
  });
  assert.deepEqual(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-02"), {
    alertCount: 2,
    deadlineDate: "2026-11-02",
    deadlineReached: true,
    unconfirmedCount: 2,
  });
});

test("확정 플래그와 촬영일이 모두 있어야 촬영 일정 확정으로 집계한다", () => {
  const result = getYoutubeFilmingAlert(
    webinarAt,
    [
      { request_status: "confirmed", filming_confirmed: true, filming_date: null },
      { request_status: "confirmed", filming_confirmed: false, filming_date: "2026-11-10" },
      { request_status: "confirmed", filming_confirmed: true, filming_date: "2026-11-11" },
    ],
    "2026-11-02",
  );

  assert.equal(result.alertCount, 2);
  assert.equal(result.unconfirmedCount, 2);
});

test("무료강의일이 없거나 유효하지 않으면 알림을 만들지 않는다", () => {
  const appearances = [{ request_status: "planned", filming_confirmed: false, filming_date: null }];
  assert.deepEqual(getYoutubeFilmingAlert(null, appearances, "2026-11-02"), {
    alertCount: 0,
    deadlineDate: null,
    deadlineReached: false,
    unconfirmedCount: 1,
  });
  assert.deepEqual(getYoutubeFilmingAlert("invalid", appearances, "2026-11-02"), {
    alertCount: 0,
    deadlineDate: null,
    deadlineReached: false,
    unconfirmedCount: 1,
  });
});

test("촬영 일정 확정 기한을 한국어 날짜로 표시한다", () => {
  assert.equal(formatYoutubeFilmingDeadline("2026-11-02"), "2026년 11월 2일");
  assert.equal(formatYoutubeFilmingDeadline(null), "—");
});
