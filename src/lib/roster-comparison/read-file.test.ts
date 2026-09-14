import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { readComparisonFile } from "./read-file";
import { compareRosters, parseComparisonPayers } from "./compare";

test("UTF-8 BOM CSV의 한글·따옴표·쉼표·줄바꿈과 전화번호를 읽고 비교한다", async () => {
  const csv = '\uFEFF결제자 명단\r\n회원명,휴대전화번호,이메일\r\n"김,회원",01012345678,member@example.com\r\n\r\n"이""회원\n추가",01087654321,other@example.com\r\n';
  const contacts = parseComparisonPayers(await readComparisonFile(Buffer.from(csv), "결제.CSV"), "결제.CSV", "phone");
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].name, "김,회원");
  assert.equal(contacts[0].phone, "01012345678");
  assert.equal(contacts[1].name, '이"회원\n추가');
  assert.equal(contacts[1].rowNumber, 5);
  const result = compareRosters(contacts, [contacts[0]], "phone");
  assert.equal(result.matchedCount, 1);
  assert.equal(result.payerOnly[0].name, contacts[1].name);
  assert.equal(result.studentOnly.length, 0);
});

test("BOM 없는 CSV도 이메일 기준으로 비교한다", async () => {
  const matrix = await readComparisonFile(Buffer.from("이름,이메일\n회원, MEMBER@Example.COM \n"), "결제.csv");
  const contacts = parseComparisonPayers(matrix, "결제.csv", "email");
  assert.equal(compareRosters(contacts, [], "email").payerOnly[0].email, "member@example.com");
});

test("잘못된 CSV 인코딩·따옴표·지원하지 않는 확장자를 안내한다", async () => {
  await assert.rejects(readComparisonFile(Uint8Array.from([0xff, 0xfe, 0x00]), "파일.csv"), /UTF-8/);
  await assert.rejects(readComparisonFile(Buffer.from('이름,연락처\n"미완성,01012345678'), "파일.csv"), /따옴표/);
  await assert.rejects(readComparisonFile(Buffer.from("test"), "파일.txt"), /xlsx 또는/);
});

test("기존 XLSX 파일 읽기를 유지한다", { skip: !existsSync("docs/purchase_order_20260912.xlsx") }, async () => {
  const matrix = await readComparisonFile(await readFile("docs/purchase_order_20260912.xlsx"), "결제.xlsx");
  assert.equal(parseComparisonPayers(matrix, "결제.xlsx", "phone").length, 120);
});
