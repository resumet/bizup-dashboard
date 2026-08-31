import assert from "node:assert/strict";
import test from "node:test";

import {
  canMapVariableToRecipientName,
  createAutomationTestKey,
  getRecipientNameVariables,
} from "./automation-config";

test("신청자·성함·이름 변수만 주소록 이름에 연결할 수 있다", () => {
  assert.equal(canMapVariableToRecipientName("신청자"), true);
  assert.equal(canMapVariableToRecipientName("성함"), true);
  assert.equal(canMapVariableToRecipientName("이름"), true);
  assert.equal(canMapVariableToRecipientName("강의시간"), false);
  assert.equal(canMapVariableToRecipientName("링크명"), false);

  assert.deepEqual(
    getRecipientNameVariables({
      신청자: "address-book-name",
      성함: "manual",
      강의시간: "address-book-name",
    }),
    ["신청자"],
  );
});

test("테스트 확인 키는 입력 순서에는 무관하고 발송 설정 변경에는 달라진다", () => {
  const base = {
    addressBookId: "book-1",
    contactId: "contact-1",
    templateId: "template-1",
    variables: { 강좌명: "강의 A", 신청자: "자동" },
  };
  const key = createAutomationTestKey(base);

  assert.equal(
    key,
    createAutomationTestKey({
      ...base,
      variables: { 신청자: "자동", 강좌명: "강의 A" },
    }),
  );
  assert.notEqual(
    key,
    createAutomationTestKey({ ...base, addressBookId: "book-2" }),
  );
  assert.notEqual(
    key,
    createAutomationTestKey({
      ...base,
      variables: { ...base.variables, 강좌명: "강의 B" },
    }),
  );
  assert.notEqual(
    key,
    createAutomationTestKey({
      ...base,
      recipientNameVariables: ["신청자"],
    }),
  );
});
