import assert from "node:assert/strict";
import test from "node:test";
import { peopleInItems, selectablePeople, hasNewInactiveAssignment } from "./people";

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

test("inactive people do not return through historical or combined WBS suggestions", () => {
  assert.deepEqual(selectablePeople(["김지은", "황지유", "황지유, 김지은", " 외부업체 ", "김지은"], ["김지은"]), ["황지유", "외부업체"]);
});
test("existing inactive WBS assignments survive editing, but new assignments are rejected", () => {
  const previous = [{ id: "one", owner: "김지은", stakeholders: "" }];
  assert.equal(hasNewInactiveAssignment(previous, previous, ["김지은"]), false);
  assert.equal(hasNewInactiveAssignment(previous, [], ["김지은"]), true);
  assert.equal(hasNewInactiveAssignment([{ id: "one", owner: "황지유", stakeholders: "김지은" }], previous, ["김지은"]), true);
  assert.equal(hasNewInactiveAssignment([{ id: "one", owner: "황지유", stakeholders: "" }], previous, ["김지은"]), false);
});
