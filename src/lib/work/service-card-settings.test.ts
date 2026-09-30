import {test} from "node:test";
import assert from "node:assert/strict";
import {WORK_SERVICE_CARD_GROUPS,workServiceCardSettingsSchema} from "./service-card-settings";
import {WORK_QUICK_TOOL_LINKS} from "./quick-tools";

test("work card settings accept known routes, remove duplicates, and reject unknown routes",()=>{
  const route=WORK_SERVICE_CARD_GROUPS[0].items[0].route;
  assert.deepEqual(workServiceCardSettingsSchema.parse({hiddenRoutes:[route,route]}),{hiddenRoutes:[route]});
  assert.equal(workServiceCardSettingsSchema.safeParse({hiddenRoutes:["/unknown"]}).success,false);
});

test("운영 워크스페이스는 간편도구를 제외하고 두 분류로 표시한다", () => {
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS.map((group) => group.title), ["강의운영", "명단관리"]);
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS[0].items.slice(0, 4).map((item) => item.route), [
    "/services/course-operations", "/services/instagram-management", "/services/course-operations/students-settlements", "/services/course-wbs",
  ]);
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS[1].items.map((item) => item.route), [
    "/services/course-roster", "/services/address-books", "/services/phone-sales-list", "/services/message-automation",
  ]);
  const routes = WORK_SERVICE_CARD_GROUPS.flatMap((group) => group.items.map((item) => item.route));
  assert.equal(routes.length, 14);
  assert.equal(new Set(routes).size, routes.length);
  const knownRoutes = new Set<string>(routes);
  for (const route of ["/services/settlement-analysis", "/services/cash-flow", "/services/purchase-analysis", "/services/ad-performance"]) {
    assert.ok(knownRoutes.has(route), `${route} 카드가 계속 표시 설정에 포함되어야 한다`);
  }
});

test("기존 간편도구 숨김 설정은 오류 없이 운영 카드 설정에서 제거한다", () => {
  const legacyQuickToolRoute = WORK_QUICK_TOOL_LINKS[0].href;
  const currentRoute = WORK_SERVICE_CARD_GROUPS[0].items[0].route;

  assert.deepEqual(
    workServiceCardSettingsSchema.parse({
      hiddenRoutes: [legacyQuickToolRoute, currentRoute],
    }),
    { hiddenRoutes: [currentRoute] },
  );
});
