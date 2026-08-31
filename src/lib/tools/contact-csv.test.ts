import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContactCsv,
  extractContactRows,
  parseClipboardTable,
} from "./contact-csv";

test("첫 행을 제외하고 이름, 전화번호, 이메일 순서로 추출한다", () => {
  const contacts = extractContactRows([
    ["이름", "전화번호 (010-0000-0000)", "이메일 주소"],
    ["홍길동", 1011112222, "hong@example.com", "사용하지 않는 값"],
    ["김영희", "01112345678", "kim@example.com"],
  ]);

  assert.deepEqual(contacts, [
    {
      name: "홍길동",
      email: "hong@example.com",
      phone: "010-1111-2222",
    },
    {
      name: "김영희",
      email: "kim@example.com",
      phone: "011-1234-5678",
    },
  ]);
});

test("한글과 이모지가 안전한 BOM 포함 CSV를 만든다", () => {
  const csv = buildContactCsv([
    { name: '홍"길동', email: "hong@example.com", phone: "010-1111-2222" },
  ]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /^\uFEFF"이름","연락처","이메일"/u);
  assert.match(csv, /"홍""길동"/u);
  assert.match(csv, /"010-1111-2222","hong@example.com"/u);
});

test("엑셀에서 복사한 탭 구분 데이터를 행과 열로 읽는다", () => {
  const table = parseClipboardTable(
    "이름\t전화번호\t이메일\r\n김영희\t010-3333-4444\tkim@example.com",
  );

  assert.equal(table.length, 2);
  assert.deepEqual(table[0], [
    "이름",
    "전화번호",
    "이메일",
  ]);
});

test("앞자리 0이 빠지거나 공백이 있는 전화번호를 정규화한다", () => {
  const contacts = extractContactRows([
    ["이름", "전화번호", "이메일"],
    ["장동현", 1030068509, "epson020@naver.com"],
    ["유한우", "010 52067337", "alanyakr@naver.com"],
  ]);

  assert.deepEqual(
    contacts.map((contact) => contact.phone),
    ["010-3006-8509", "010-5206-7337"],
  );
});
