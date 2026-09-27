import assert from "node:assert/strict";
import test from "node:test";
import { peopleInItems } from "./people";

test("people choices preserve distinct complete owner and stakeholder entries", () => {
  assert.deepEqual(peopleInItems([
    { owner: " 김지은 ", stakeholders: "황지유, 김지은" },
    { owner: "김지은", stakeholders: "" },
    { owner: "황지유", stakeholders: 42 },
    null,
    { owner: " ", stakeholders: " 외부 업체 (A) " },
  ]), ["김지은", "황지유, 김지은", "황지유", "외부 업체 (A)"]);
  assert.deepEqual(peopleInItems({ owner: "김지은" }), []);
});
