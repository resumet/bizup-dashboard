import assert from "node:assert/strict";
import test from "node:test";
import { filterDashboardMenus } from "./menu-search";

test("새 개별 화면은 공통 메뉴 검색에서 제목과 추가 검색어로 찾아진다", () => {
  assert.equal(filterDashboardMenus("링크 모음")[0]?.href, "/services/tools/links");
  assert.equal(filterDashboardMenus("바로가기")[0]?.href, "/services/tools/links");
});
