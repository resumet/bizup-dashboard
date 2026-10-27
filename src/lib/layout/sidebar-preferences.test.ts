import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  clampSidebarWidth,
} from "./sidebar-preferences";

test("사이드바 폭을 허용 범위 안으로 제한한다", () => {
  assert.equal(clampSidebarWidth(180), MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(320.4), 320);
  assert.equal(clampSidebarWidth(500), MAX_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(Number.NaN), DEFAULT_SIDEBAR_WIDTH);
});
