import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_YOUTUBE_FILMING_ALERT_WEEKS,
  YOUTUBE_FILMING_ALERT_WEEK_OPTIONS,
  youtubeFilmingAlertSettingsSchema,
} from "./settings";

test("유튜브 촬영 일정 알림 기준은 3주부터 6주까지 허용된 선택지만 받는다", () => {
  assert.equal(DEFAULT_YOUTUBE_FILMING_ALERT_WEEKS, 4);
  assert.deepEqual(YOUTUBE_FILMING_ALERT_WEEK_OPTIONS, [3, 4, 5, 6]);
  for (const filmingAlertWeeks of YOUTUBE_FILMING_ALERT_WEEK_OPTIONS) {
    assert.equal(youtubeFilmingAlertSettingsSchema.parse({ filmingAlertWeeks }).filmingAlertWeeks, filmingAlertWeeks);
  }
  assert.equal(youtubeFilmingAlertSettingsSchema.safeParse({ filmingAlertWeeks: 2 }).success, false);
  assert.equal(youtubeFilmingAlertSettingsSchema.safeParse({ filmingAlertWeeks: 7 }).success, false);
  assert.equal(youtubeFilmingAlertSettingsSchema.safeParse({ filmingAlertWeeks: "4" }).success, false);
});
