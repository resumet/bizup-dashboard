import assert from "node:assert/strict";
import test from "node:test";

import type { RosterRow } from "@/lib/jobs/types";
import { selectCombinedRosterMessageTargets } from "./combined-roster";

function row(
  id: string,
  phone: string,
  overrides: Partial<RosterRow> = {},
): RosterRow {
  return {
    id,
    sourceRowNumber: 2,
    normalizedPhone: phone,
    isDuplicate: false,
    groupChatJoined: false,
    isExtraParticipant: false,
    isManuallyAdded: false,
    memo: "",
    values: {
      courseName: "강의",
      optionName: "옵션",
      customerName: id,
      email: "",
      phone,
      referrer: "",
      source: "",
      adMedia: "",
    },
    ...overrides,
  };
}

test("여러 명단에서 선택한 수강생을 전화번호 기준으로 한 번만 발송한다", () => {
  const targets = selectCombinedRosterMessageTargets(
    [row("first", "010-1111-2222"), row("same", "01011112222"), row("other", "01033334444")],
    ["first", "same", "other"],
    false,
  );

  assert.deepEqual(
    targets.map((target) => target.id),
    ["first", "other"],
  );
});

test("단톡방 미참여자 발송에서는 참여자와 별도 추가 인원을 제외한다", () => {
  const targets = selectCombinedRosterMessageTargets(
    [
      row("target", "01011112222"),
      row("joined", "01022223333", { groupChatJoined: true }),
      row("extra", "01033334444", { isExtraParticipant: true }),
    ],
    ["target", "joined", "extra"],
    true,
  );

  assert.deepEqual(targets.map((target) => target.id), ["target"]);
});
