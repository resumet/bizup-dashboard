import assert from "node:assert/strict";
import test from "node:test";

import { mergeAddressBookContacts } from "./merge";

test("주소록 병합 시 같은 전화번호는 하나만 남긴다", () => {
  const result = mergeAddressBookContacts([
    [
      { normalized_phone: "010-1111-2222", name: "첫 번째", email: "first@example.com" },
      { normalized_phone: "010-3333-4444", name: "두 번째", email: null },
    ],
    [
      { normalized_phone: "010-1111-2222", name: "다른 이름", email: "other@example.com" },
      { normalized_phone: "010-5555-6666", name: "세 번째", email: null },
    ],
  ]);

  assert.equal(result.sourceContactCount, 4);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.contacts.length, 3);
  assert.deepEqual(result.contacts[0], {
    normalized_phone: "010-1111-2222",
    name: "첫 번째",
    email: "first@example.com",
  });
});

test("먼저 선택한 연락처의 빈 정보만 뒤 주소록 데이터로 보완한다", () => {
  const result = mergeAddressBookContacts([
    [
      { normalized_phone: "010-1111-2222", name: "  ", email: "kept@example.com" },
    ],
    [
      { normalized_phone: "010-1111-2222", name: "보완된 이름", email: "ignored@example.com" },
    ],
  ]);

  assert.deepEqual(result.contacts, [
    {
      normalized_phone: "010-1111-2222",
      name: "보완된 이름",
      email: "kept@example.com",
    },
  ]);
});

test("콜세일즈용은 010 외 번호를 원본 항목별로 제외하고 010 중복만 정리한다", () => {
  const groups = [
    [
      { normalized_phone: "01012345678", name: "휴대전화", email: null },
      { normalized_phone: "0212345678", name: "유선", email: "office@example.com" },
      { normalized_phone: "0111234567", name: "011 번호", email: null },
    ],
    [
      { normalized_phone: "01012345678", name: "중복", email: "mobile@example.com" },
      { normalized_phone: "0212345678", name: "다른 주소록 유선", email: null },
      { normalized_phone: "07012345678", name: "인터넷 전화", email: null },
      { normalized_phone: " 010-9876-5432 ", name: "다른 휴대전화", email: null },
    ],
  ];
  const before = structuredClone(groups);
  const result = mergeAddressBookContacts(groups, { callSalesOnly: true });
  assert.equal(result.contacts.length, 2);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.sourceContactCount, 7);
  assert.equal(result.excludedContacts.length, 4);
  assert.deepEqual(result.excludedContacts.map((contact) => contact.sourceGroupIndex), [0, 0, 1, 1]);
  assert.equal(result.contacts[0].email, "mobile@example.com");
  assert.ok(result.contacts.every((contact) => contact.normalized_phone.startsWith("010")));
  assert.deepEqual(groups, before);
});

test("콜세일즈용을 선택하지 않으면 유선·011·070 번호도 병합한다", () => {
  const contacts = ["0212345678", "0111234567", "07012345678"].map((normalized_phone) => ({ normalized_phone, name: null, email: null }));
  for (const options of [{}, { callSalesOnly: false }]) {
    const result = mergeAddressBookContacts([contacts], options);
    assert.equal(result.contacts.length, 3);
    assert.deepEqual(result.excludedContacts, []);
  }
});

test("모두 제외되거나 번호가 비어 있어도 제외 건수와 목록이 일치한다", () => {
  const result = mergeAddressBookContacts([[
    { normalized_phone: " ", name: "번호 없음", email: null },
    { normalized_phone: "+821012345678", name: "010으로 시작하지 않음", email: null },
    { normalized_phone: "0311234567", name: "지역 번호", email: null },
  ]], { callSalesOnly: true });
  assert.deepEqual(result.contacts, []);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.excludedContacts.length, 3);
  const noneExcluded = mergeAddressBookContacts([[{ normalized_phone: "01012345678", name: "정상", email: null }]], { callSalesOnly: true });
  assert.equal(noneExcluded.excludedContacts.length, 0);
  assert.equal(noneExcluded.contacts.length, 1);
});

test("세 주소록을 합치고 제외 명단과 같은 번호를 한 번만 차감한다", () => {
  const contact = (phone: string) => ({ normalized_phone: phone, name: "신청자", email: null });
  const groups = [
    [contact("010-1111-2222"), contact("01033334444")],
    [contact("01011112222"), contact("01055556666")],
    [contact("01077778888"), contact("01033334444")],
  ];
  const before = structuredClone(groups);
  const result = mergeAddressBookContacts(groups, {
    excludedPhones: ["+82 10 1111 2222", "01011112222", "01055556666", "01099990000", ""],
  });
  assert.deepEqual(result.contacts.map(contact => contact.normalized_phone), ["01033334444", "01077778888"]);
  assert.equal(result.sourceContactCount, 6);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.matchedExclusionCount, 2);
  assert.deepEqual(groups, before);
});

test("제외 명단에 모두 포함되면 결과가 비어도 실제 제외 인원을 반환한다", () => {
  const result = mergeAddressBookContacts([[
    { normalized_phone: "01011112222", name: null, email: null },
  ]], { excludedPhones: ["010-1111-2222"] });
  assert.equal(result.contacts.length, 0);
  assert.equal(result.matchedExclusionCount, 1);
  assert.equal(result.duplicateCount, 0);
});

test("콜세일즈 번호 제외와 명단 제외 건수는 겹치지 않는다", () => {
  const result = mergeAddressBookContacts([[
    { normalized_phone: "0212345678", name: null, email: null },
    { normalized_phone: "01011112222", name: null, email: null },
    { normalized_phone: "01033334444", name: null, email: null },
  ]], { callSalesOnly: true, excludedPhones: ["0212345678", "01011112222"] });
  assert.equal(result.contacts.length, 1);
  assert.equal(result.excludedContacts.length, 1);
  assert.equal(result.matchedExclusionCount, 1);
  assert.equal(result.duplicateCount, 0);
});
