import assert from "node:assert/strict";
import test from "node:test";

import { formatKoreaWeekday, nextKoreaDate } from "./schedule";

test("날짜 입력값과 저장된 시각의 요일을 한국 시간으로 표시한다", () => {
  assert.equal(formatKoreaWeekday("2026-12-07"), "월");
  assert.equal(formatKoreaWeekday("2026-12-06T15:00:00Z"), "월");
  assert.equal(formatKoreaWeekday(""), "");
});

test("개강일 최소 날짜는 무료 웨비나 다음 날이다", () => {
  assert.equal(nextKoreaDate("2026-11-12"), "2026-11-13");
  assert.equal(nextKoreaDate("2026-12-31"), "2027-01-01");
  assert.equal(nextKoreaDate("invalid"), "");
});
