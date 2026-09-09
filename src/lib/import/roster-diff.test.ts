import assert from "node:assert/strict";
import test from "node:test";

import type { StoredRosterRecord } from "./roster";
import { buildUpdatedRosterRecords, compareRosterRecords } from "./roster-diff";

function record(
  phone: string,
  name: string,
  groupChatJoined = false,
  memo = "",
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
      memo,
    },
    originalValues: {},
    isDuplicate: false,
    isExtraParticipant: false,
  };
}

test("기존 명단과 새 파일에서 추가·삭제·유지 항목을 전화번호로 비교한다", () => {
  const current = [
    record("01011112222", "기존 유지"),
    record("01033334444", "삭제 대상"),
  ];
  const incoming = [
    record("01011112222", "기존 유지"),
    record("01055556666", "추가 대상"),
  ];
  const diff = compareRosterRecords(current, incoming);
  assert.equal(diff.matches.length, 1);
  assert.equal(diff.additions[0].normalizedPhone, "01055556666");
  assert.equal(diff.removals[0].normalizedPhone, "01033334444");
});

test("승인된 추가·삭제만 적용하고 기존 단톡방 참여 상태와 비고는 보존한다", () => {
  const current = [
    { ...record("01011112222", "기존 이름", true, "재결제 확인"), isExtraParticipant: true },
    record("01033334444", "삭제 보류"),
  ];
  const incoming = [
    record("01011112222", "기존 이름"),
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
  assert.equal(updated[0].normalizedValues.customerName, "기존 이름");
  assert.equal(updated[0].normalizedValues.groupChatJoined, true);
  assert.equal(updated[0].normalizedValues.memo, "재결제 확인");
  assert.equal(updated[0].isExtraParticipant, true);
});

test("같은 전화번호의 다른 이름은 자동 갱신이나 일괄 추가·삭제 승인으로 처리할 수 없다", () => {
  const current = [record("01011112222", "기존 이름", true, "보존할 메모")];
  const incoming = [record("01011112222", "다른 이름")];
  const diff = compareRosterRecords(current, incoming);
  assert.equal(diff.matches.length, 0);
  assert.equal(diff.additions.length, 0);
  assert.equal(diff.removals.length, 0);
  assert.deepEqual(diff.nameConflicts[0].otherNames, ["기존 이름"]);
  assert.throws(() => buildUpdatedRosterRecords(current, incoming, {
    approveAdditions: true, approveRemovals: true,
  }), /추가 여부/);
  const skipped = buildUpdatedRosterRecords(current, incoming, {
    approveAdditions: true, approveRemovals: true, nameConflictDecisions: { "0": "skip" },
  });
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].normalizedValues.customerName, "기존 이름");
  assert.equal(skipped[0].normalizedValues.memo, "보존할 메모");
  const added = buildUpdatedRosterRecords(current, incoming, {
    approveAdditions: false, approveRemovals: true, nameConflictDecisions: { "0": "add" },
  });
  assert.deepEqual(added.map((row) => row.normalizedValues.customerName), ["다른 이름", "기존 이름"]);
  assert.ok(added.every((row) => row.isDuplicate));
});

test("새 파일 내부에서 같은 전화번호의 이름이 달라도 각 행의 결정을 요구한다", () => {
  const incoming = [record("01011112222", "첫 이름"), record("01011112222", "다른 이름")];
  const diff = compareRosterRecords([], incoming);
  assert.equal(diff.nameConflicts.length, 2);
  assert.throws(() => buildUpdatedRosterRecords([], incoming, {
    approveAdditions: true, approveRemovals: false, nameConflictDecisions: { "0": "add" },
  }), /추가 여부/);
  const updated = buildUpdatedRosterRecords([], incoming, {
    approveAdditions: false, approveRemovals: false, nameConflictDecisions: { "0": "skip", "1": "add" },
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].normalizedValues.customerName, "다른 이름");
});

test("이름 앞뒤 공백은 충돌로 보지 않고 같은 이름의 중복 행은 기존 비교 규칙을 유지한다", () => {
  const current = [record("01011112222", "이름")];
  const incoming = [record("01011112222", " 이름 "), record("01011112222", "이름")];
  const diff = compareRosterRecords(current, incoming);
  assert.equal(diff.nameConflicts.length, 0);
  assert.equal(diff.matches.length, 1);
  assert.equal(diff.additions.length, 1);
});

test("주문 엑셀에 없는 강의명·옵션명·유입경로는 기존 수강생 정보를 보존한다", () => {
  const existing = record("01011112222", "같은 이름", true, "메모");
  existing.normalizedValues.optionName = "프리미엄";
  existing.normalizedValues.source = "유튜브";
  const order = record("01011112222", "같은 이름");
  order.normalizedValues.courseName = "";
  const [updated] = buildUpdatedRosterRecords([existing], [order], {
    approveAdditions: true, approveRemovals: false,
  });
  assert.equal(updated.normalizedValues.courseName, "강의");
  assert.equal(updated.normalizedValues.optionName, "프리미엄");
  assert.equal(updated.normalizedValues.source, "유튜브");
  assert.equal(updated.normalizedValues.groupChatJoined, true);
});

test("최초 가져오기에서 충돌 행을 제외해도 원본 행 번호를 보존하고 중복 표시를 다시 계산한다", () => {
  const incoming = [
    { ...record("01011112222", "이름 A"), sourceRowNumber: 3, isDuplicate: true },
    { ...record("01011112222", "이름 B"), sourceRowNumber: 8, isDuplicate: true },
  ];
  const updated = buildUpdatedRosterRecords([], incoming, {
    approveAdditions: true, approveRemovals: false,
    nameConflictDecisions: { "0": "skip", "1": "add" }, preserveSourceRowNumbers: true,
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].sourceRowNumber, 8);
  assert.equal(updated[0].isDuplicate, false);
});
