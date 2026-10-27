import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardMenuSearchKeywordSettings,
  dashboardMenuSearchKeywordSettingsSchema,
} from "./menu-search-keywords";

test("메뉴별 추가 검색어를 정리하고 중복을 제거한다", () => {
  assert.deepEqual(createDashboardMenuSearchKeywordSettings({
    "/services/course-wbs": " 오늘 할 일, 오늘할일,  업무   일정 ",
  }), {
    keywords: {
      "/services/course-wbs": ["오늘 할 일", "업무 일정"],
    },
  });
});

test("등록되지 않은 메뉴와 메뉴별 허용 개수를 거부한다", () => {
  assert.equal(dashboardMenuSearchKeywordSettingsSchema.safeParse({ keywords: { "/unknown": ["검색어"] } }).success, false);
  assert.equal(dashboardMenuSearchKeywordSettingsSchema.safeParse({
    keywords: { "/services/course-wbs": Array.from({ length: 13 }, (_, index) => `검색어 ${index}`) },
  }).success, false);
});
