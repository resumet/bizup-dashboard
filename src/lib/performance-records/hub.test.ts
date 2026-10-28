import assert from "node:assert/strict";
import test from "node:test";

import { PERFORMANCE_RECORD_HUB_ITEMS } from "./hub";

test("성과기록 허브는 내부광고와 외부광고 성과기록을 제공한다", () => {
  assert.deepEqual(PERFORMANCE_RECORD_HUB_ITEMS, [
    { label: "내부광고 성과기록", href: "/services/ad-performance" },
    { label: "외부광고 성과기록", href: "/services/external-marketing" },
  ]);
});
