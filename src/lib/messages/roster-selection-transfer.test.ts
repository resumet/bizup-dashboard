import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRosterSelection,
  parseRosterSelectionRecipients,
  serializeRosterSelection,
} from "./roster-selection-transfer";

test("수강생 명단 선택 목록을 중복 없이 전달한다", () => {
  const serialized = serializeRosterSelection(
    "roster:job-1",
    ["row-1", "row-2", "row-1"],
    [
      { id: "row-1", name: "김수강", phone: "01011112222" },
      { id: "row-2", name: "이수강", phone: "01033334444" },
      { id: "not-selected", name: "박수강", phone: "01055556666" },
    ],
  );

  assert.deepEqual(parseRosterSelection(serialized, "roster:job-1"), [
    "row-1",
    "row-2",
  ]);
  assert.deepEqual(parseRosterSelection(serialized, "roster:job-2"), []);
  assert.deepEqual(
    parseRosterSelectionRecipients(serialized, "roster:job-1"),
    [
      { id: "row-1", name: "김수강", phone: "01011112222" },
      { id: "row-2", name: "이수강", phone: "01033334444" },
    ],
  );
});

test("손상되었거나 제한을 넘은 선택 목록은 거부한다", () => {
  assert.deepEqual(parseRosterSelection("not-json", "roster:job-1"), []);
  assert.deepEqual(
    parseRosterSelection(
      serializeRosterSelection(
        "roster:job-1",
        Array.from({ length: 1_001 }, (_, index) => `row-${index}`),
      ),
      "roster:job-1",
    ),
    [],
  );
});
