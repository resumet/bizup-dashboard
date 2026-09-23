import {test} from "node:test";
import assert from "node:assert/strict";
import {WORK_SERVICE_CARD_GROUPS,workServiceCardSettingsSchema} from "./service-card-settings";

test("work card settings accept known routes, remove duplicates, and reject unknown routes",()=>{
  const route=WORK_SERVICE_CARD_GROUPS[0].items[0].route;
  assert.deepEqual(workServiceCardSettingsSchema.parse({hiddenRoutes:[route,route]}),{hiddenRoutes:[route]});
  assert.equal(workServiceCardSettingsSchema.safeParse({hiddenRoutes:["/unknown"]}).success,false);
});
