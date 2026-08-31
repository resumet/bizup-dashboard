import assert from "node:assert/strict";
import test from "node:test";

import type { StoredRosterRecord } from "./roster";
import { buildUpdatedRosterRecords, compareRosterRecords } from "./roster-diff";

function record(
  phone: string,
  name: string,
  groupChatJoined = false,
): StoredRosterRecord {
  return {
    sourceRowNumber: 2,
    normalizedPhone: phone,
    normalizedValues: {
      courseName: "강의",
      optionName: "",
      customerName: name,
      email: "",
      phone,
      referrer: "",
      source: "",
      adMedia: "",
      groupChatJoined,
    },
    originalValues: {},
    isDuplicate: false,
  };
}

test("기존 명단과 새 파일에서 추가·삭제·유지 항목을 전화번호로 비교한다", () => {
  const current = [
    record("01011112222", "기존 유지"),
    record("01033334444", "삭제 대상"),
  ];
  const incoming = [
    record("01011112222", "새 이름"),
    record("01055556666", "추가 대상"),
  ];
  const diff = compareRosterRecords(current, incoming);
  assert.equal(diff.matches.length, 1);
  assert.equal(diff.additions[0].normalizedPhone, "01055556666");
  assert.equal(diff.removals[0].normalizedPhone, "01033334444");
});

test("승인된 추가·삭제만 적용하고 기존 단톡방 참여 상태는 보존한다", () => {
  const current = [
    record("01011112222", "기존 이름", true),
    record("01033334444", "삭제 보류"),
  ];
  const incoming = [
    record("01011112222", "새 이름"),
    record("01055556666", "추가 승인"),
  ];
  const updated = buildUpdatedRosterRecords(current, incoming, {
    approveAdditions: true,
    approveRemovals: false,
  });
  assert.deepEqual(
    updated.map((item) => item.normalizedPhone),
    ["01011112222", "01055556666", "01033334444"],
  );
  assert.equal(updated[0].normalizedValues.customerName, "새 이름");
  assert.equal(updated[0].normalizedValues.groupChatJoined, true);
});
