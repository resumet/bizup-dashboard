import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readSheet } from "read-excel-file/node";
import { parse } from "csv-parse/sync";
import { compareRosters, parseComparisonPayers } from "./compare";
import { comparisonCsv } from "./export";
import type { ComparisonContact } from "./types";

const contact = (name: string, phone: string, source = "명단A", email = ""): ComparisonContact => ({ name, phone, source, email, rowNumber: 2 });

test("양방향 차집합을 계산하고 다수 명단의 중복 연락처와 출처를 합친다", () => {
  const result = compareRosters([
    contact("결제자만", "010-1111-1111"), contact("공통", "+82 10 2222 2222"), contact("공통", "1022222222"),
    contact("동명이인", "01033333333"), contact("확인필요", ""),
  ], [contact("공통", "01022222222"), contact("수강생만", "01044444444"), contact("수강생만", "010-4444-4444", "명단B"), contact("동명이인", "01055555555"), contact("잘못된값", "123")], "phone");
  assert.deepEqual(result.payerOnly.map((person) => person.name), ["결제자만", "동명이인"]);
  assert.deepEqual(result.studentOnly.map((person) => person.name), ["수강생만", "동명이인"]);
  assert.deepEqual(result.studentOnly[0].sources, ["명단A", "명단B"]);
  assert.equal(result.studentOnly[0].rowCount, 2);
  assert.equal(result.payerCount, 3); assert.equal(result.studentCount, 3); assert.equal(result.matchedCount, 1);
  assert.equal(result.payerDuplicateRows, 1); assert.equal(result.studentDuplicateRows, 1);
  assert.equal(result.invalidPayers.length, 1); assert.equal(result.invalidStudents.length, 1);
});

test("이메일은 대소문자와 공백을 정리하고 선택한 기준만 사용한다", () => {
  const payers = [contact("공통", "01011111111", "결제", " Member@Example.COM "), contact("잘못된 이메일", "01022222222", "결제", "no-at")];
  const students = [contact("공통", "01033333333", "수강생", "member@example.com")];
  assert.equal(compareRosters(payers, students, "email").matchedCount, 1);
  assert.equal(compareRosters(payers, students, "email").invalidPayers.length, 1);
  assert.equal(compareRosters(payers, students, "phone").matchedCount, 0);
  assert.equal(compareRosters([], students, "phone").studentOnly.length, 1);
  assert.equal(compareRosters(payers, [], "phone").payerOnly.length, 2);
});

test("엑셀 열 별칭·제목 행·숫자 전화번호·빈 값과 실제 원본 행 번호를 처리한다", () => {
  const contacts = parseComparisonPayers([["결제자 명단"], ["회원명", "휴대전화번호", "이메일"], ["회원", 1012345678, "member@example.com"], [], ["확인필요", "", ""]], "결제.xlsx", "phone");
  assert.equal(contacts.length, 2); assert.equal(contacts[1].rowNumber, 5);
  assert.equal(compareRosters(contacts, [], "phone").payerOnly[0].phone, "01012345678");
  assert.equal(parseComparisonPayers([["연락처", ""], ["01012345678", "잘못된열"]], "파일", "phone")[0].name, "");
  assert.throws(() => parseComparisonPayers([["이름"], ["회원"]], "파일", "phone"), /열을 찾지/);
  assert.throws(() => parseComparisonPayers([["이메일"]], "파일", "email"), /비교할 데이터/);
});

test("CSV에 한글·쉼표·줄바꿈·전화번호를 보존하고 수식 실행을 방지한다", () => {
  const result = compareRosters([contact('=SUM(1,2)\n회원', "01012345678")], [], "phone");
  const csv = comparisonCsv(result.payerOnly);
  assert.ok(csv.startsWith("\uFEFF"));
  const records = parse(csv, { bom: true });
  assert.equal(records.length, 2);
  assert.equal(records[1][0], "'=SUM(1,2)\n회원");
  assert.equal(records[1][1], "010-1234-5678");
});

test("샘플 주문결제 엑셀을 결제자 명단으로 읽는다", { skip: !existsSync("docs/purchase_order_20260912.xlsx") }, async () => {
  const sheet = await readSheet("docs/purchase_order_20260912.xlsx", 1);
  const contacts = parseComparisonPayers(sheet as unknown[][], "결제자.xlsx", "phone");
  assert.equal(contacts.length, 120);
  const result = compareRosters(contacts, contacts, "phone");
  assert.equal(result.payerOnly.length, 0); assert.equal(result.studentOnly.length, 0);
  assert.ok(result.matchedCount > 0);
});
