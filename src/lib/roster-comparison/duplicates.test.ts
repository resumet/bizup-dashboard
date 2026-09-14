import assert from "node:assert/strict";
import test from "node:test";
import { findRosterDuplicates } from "./compare";
import { comparisonCsv } from "./export";
import type { ComparisonContact } from "./types";

const row = (phone: string, source: string, rowNumber: number, name = "회원", email = ""): ComparisonContact => ({ phone, source, rowNumber, name, email });

test("명단 내부와 명단 간 중복을 모두 찾고 등장 횟수와 원본 위치를 보존한다", () => {
  const result = findRosterDuplicates([
    row("01012345678", "명단 A", 2), row("+82 10 1234 5678", "명단 A", 8), row("1012345678", "명단 B", 3),
    row("01087654321", "명단 B", 4), row("010-8765-4321", "명단 C", 5),
    row("01011112222", "명단 A", 9), row("", "명단 A", 10), row("123", "명단 B", 11),
  ], "phone");
  assert.equal(result.totalRows, 8);
  assert.equal(result.uniqueCount, 3);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.duplicateRows, 3);
  assert.equal(result.invalid.length, 2);
  assert.equal(result.duplicates[0].rowCount, 3);
  assert.deepEqual(result.duplicates[0].sources, ["명단 A (원본 2행)", "명단 A (원본 8행)", "명단 B (원본 3행)"]);
  const csv = comparisonCsv(result.duplicates);
  assert.ok(csv.includes("명단 B (원본 3행)"));
  assert.ok(csv.includes('"3"'));
});

test("이메일을 정규화하고 동일 이름만으로 중복으로 보지 않는다", () => {
  const contacts = [row("01012345678", "명단", 2, "동명", " MEMBER@Example.com "), row("01087654321", "명단", 3, "동명", "member@example.com")];
  assert.equal(findRosterDuplicates(contacts, "email").duplicates.length, 1);
  assert.equal(findRosterDuplicates(contacts, "phone").duplicates.length, 0);
  assert.equal(findRosterDuplicates([row("", "명단", 2), row("", "명단", 3)], "phone").duplicates.length, 0);
  assert.equal(findRosterDuplicates([], "phone").uniqueCount, 0);
});
