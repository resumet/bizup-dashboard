import assert from "node:assert/strict";
import test from "node:test";

import {
  formatYoutubeFilmingDeadline,
  getYoutubeFilmingAlert,
  YOUTUBE_FILMING_ALERT_DAYS,
} from "./filming-alert";

const webinarAt = "2026-12-07T19:30:00+09:00";

test("무료강의 4주 전부터 출연 확정 건의 촬영 일정 미확정을 알린다", () => {
  const appearances = [
    { request_status: "planned", filming_confirmed: false, filming_date: null },
    { request_status: "requested", filming_confirmed: false, filming_date: null },
    { request_status: "confirmed", filming_confirmed: false, filming_date: null },
    { request_status: "confirmed", filming_confirmed: true, filming_date: null },
    { request_status: "confirmed", filming_confirmed: true, filming_date: "2026-11-10" },
    { request_status: "declined", filming_confirmed: false, filming_date: null },
  ];

  assert.equal(YOUTUBE_FILMING_ALERT_DAYS, 28);
  assert.deepEqual(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-08"), {
    alertCount: 0,
    deadlineDate: "2026-11-09",
    deadlineReached: false,
    unconfirmedCount: 2,
  });
  assert.deepEqual(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-09"), {
    alertCount: 2,
    deadlineDate: "2026-11-09",
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
    "2026-11-09",
  );

  assert.equal(result.alertCount, 2);
  assert.equal(result.unconfirmedCount, 2);
});

test("관리자가 선택한 3·5·6주 기준으로 알림 시작일을 계산한다", () => {
  const appearances = [
    { request_status: "confirmed", filming_confirmed: false, filming_date: null },
  ];

  assert.deepEqual(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-15", 3), {
    alertCount: 0,
    deadlineDate: "2026-11-16",
    deadlineReached: false,
    unconfirmedCount: 1,
  });
  assert.equal(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-16", 3).alertCount, 1);
  assert.equal(getYoutubeFilmingAlert(webinarAt, appearances, "2026-11-02", 5).deadlineDate, "2026-11-02");
  assert.equal(getYoutubeFilmingAlert(webinarAt, appearances, "2026-10-26", 6).deadlineDate, "2026-10-26");
});

test("무료강의일이 없거나 유효하지 않으면 알림을 만들지 않는다", () => {
  const appearances = [{ request_status: "confirmed", filming_confirmed: false, filming_date: null }];
  assert.deepEqual(getYoutubeFilmingAlert(null, appearances, "2026-11-09"), {
    alertCount: 0,
    deadlineDate: null,
    deadlineReached: false,
    unconfirmedCount: 1,
  });
  assert.deepEqual(getYoutubeFilmingAlert("invalid", appearances, "2026-11-09"), {
    alertCount: 0,
    deadlineDate: null,
    deadlineReached: false,
    unconfirmedCount: 1,
  });
});

test("촬영 일정 확정 기한을 한국어 날짜로 표시한다", () => {
  assert.equal(formatYoutubeFilmingDeadline("2026-11-09"), "2026년 11월 9일");
  assert.equal(formatYoutubeFilmingDeadline(null), "—");
});
