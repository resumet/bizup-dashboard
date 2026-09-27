import {test} from "node:test";
import assert from "node:assert/strict";
import {WORK_SERVICE_CARD_GROUPS,workServiceCardSettingsSchema} from "./service-card-settings";

test("work card settings accept known routes, remove duplicates, and reject unknown routes",()=>{
  const route=WORK_SERVICE_CARD_GROUPS[0].items[0].route;
  assert.deepEqual(workServiceCardSettingsSchema.parse({hiddenRoutes:[route,route]}),{hiddenRoutes:[route]});
  assert.equal(workServiceCardSettingsSchema.safeParse({hiddenRoutes:["/unknown"]}).success,false);
});

test("운영 워크스페이스는 기존 카드를 잃지 않고 세 분류로 표시한다", () => {
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS.map((group) => group.title), ["강의운영", "명단관리", "간편도구"]);
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS[0].items.slice(0, 4).map((item) => item.route), [
    "/services/course-operations", "/services/course-wbs", "/services/course-schedule-planner", "/services/course-webinars",
  ]);
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS[1].items.map((item) => item.route), [
    "/services/course-roster", "/services/address-books", "/services/phone-sales-list", "/services/message-automation",
  ]);
  assert.deepEqual(WORK_SERVICE_CARD_GROUPS[2].items.map((item) => item.route), [
    "/services/roster-duplicates", "/services/roster-comparison", "/tools/settlement-calculator",
    "/services/contact-csv", "/services/youtube-download", "/services/nova-settlement-validator",
  ]);

  const routes = WORK_SERVICE_CARD_GROUPS.flatMap((group) => group.items.map((item) => item.route));
  assert.equal(routes.length, 18);
  assert.equal(new Set(routes).size, routes.length);
  const knownRoutes = new Set<string>(routes);
  for (const route of ["/services/settlement-analysis", "/services/cash-flow", "/services/purchase-analysis", "/services/ad-performance"]) {
    assert.ok(knownRoutes.has(route), `${route} 카드가 계속 표시 설정에 포함되어야 한다`);
  }
});
