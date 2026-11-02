import assert from "node:assert/strict";
import test from "node:test";

import { buildYoutubePreparationSummary } from "./youtube-preparation";

test("유튜브 출연 확정·촬영 일정 확정·업로드 완료를 강의별로 집계한다", () => {
  const result = buildYoutubePreparationSummary(
    "2026-12-07T19:30:00+09:00",
    [
      { request_status: "planned", filming_confirmed: false, filming_date: null, upload_date: null },
      { request_status: "confirmed", filming_confirmed: false, filming_date: null, upload_date: null },
      { request_status: "confirmed", filming_confirmed: true, filming_date: "2026-11-10", upload_date: null },
      { request_status: "confirmed", filming_confirmed: true, filming_date: "2026-11-11", upload_date: "2026-11-20" },
    ],
    "2026-11-09",
    4,
  );

  assert.deepEqual(result, {
    appearanceNotRequired: false,
    appearanceCount: 4,
    confirmedAppearanceCount: 3,
    filmingConfirmedCount: 2,
    uploadCompletedCount: 1,
    filmingAlertCount: 1,
    filmingAlertWeeks: 4,
  });
});

test("유튜브 출연 없이 진행하는 강의는 촬영 일정 경고에서 제외한다", () => {
  const result = buildYoutubePreparationSummary(
    "2026-12-07T19:30:00+09:00",
    [{ request_status: "confirmed", filming_confirmed: false, filming_date: null, upload_date: null }],
    "2026-11-09",
    4,
    true,
  );

  assert.equal(result.appearanceNotRequired, true);
  assert.equal(result.filmingAlertCount, 0);
});

test("관리자 알림 기준 전에는 촬영 일정 미확정 건을 주의로 표시하지 않는다", () => {
  const result = buildYoutubePreparationSummary(
    "2026-12-07T19:30:00+09:00",
    [{ request_status: "confirmed", filming_confirmed: false, filming_date: null, upload_date: null }],
    "2026-11-15",
    3,
  );

  assert.equal(result.filmingAlertCount, 0);
  assert.equal(result.filmingAlertWeeks, 3);
});
