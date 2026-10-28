import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_HUB_ITEMS } from "./hub";

test("도구 허브는 기존 도구와 영상 대본 추출을 카드 대상으로 제공한다", () => {
  assert.deepEqual(
    TOOL_HUB_ITEMS.map(({ href }) => href),
    [
      "/services/roster-duplicates",
      "/services/roster-comparison",
      "/tools/settlement-calculator",
      "/services/contact-csv",
      "/services/youtube-download",
      "/services/nova-settlement-validator",
      "/extras",
      "/services/youtube-channels",
    ],
  );
  assert.equal(
    TOOL_HUB_ITEMS.find(({ href }) => href === "/extras")?.label,
    "영상 대본 추출",
  );
  assert.equal(
    TOOL_HUB_ITEMS.find(({ href }) => href === "/services/youtube-channels")?.label,
    "유튜브 채널 관리",
  );
  const routes: readonly string[] = TOOL_HUB_ITEMS.map(({ href }) => href);
  assert.equal(routes.includes("/services/course-schedule-planner"), false);
});
