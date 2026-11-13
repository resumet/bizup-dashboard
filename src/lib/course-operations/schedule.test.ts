import assert from "node:assert/strict";
import test from "node:test";

import { nextKoreaDate } from "./schedule";

test("개강일 최소 날짜는 무료 웨비나 다음 날이다", () => {
  assert.equal(nextKoreaDate("2026-11-12"), "2026-11-13");
  assert.equal(nextKoreaDate("2026-12-31"), "2027-01-01");
  assert.equal(nextKoreaDate("invalid"), "");
});
