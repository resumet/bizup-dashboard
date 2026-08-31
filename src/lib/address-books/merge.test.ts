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
