import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import writeXlsxFile from "write-excel-file/node";

import { parseAddressBookFile } from "./parse";

test("수강생 CSV를 이름·전화번호·이메일 주소록으로 변환한다", async () => {
  const path = "docs/플랫폼트리x맹렬-AI수익화퍼널마케팅실전클래스-수강생명단-0826.csv";
  const parsed = await parseAddressBookFile(await readFile(path), path);
  assert.equal(parsed.contacts.length, 43);
  assert.match(parsed.contacts[0].normalizedPhone, /^010\d{8}$/);
  assert.ok(parsed.contacts[0].name);
});

test("주소록에 비표준 전화번호도 숫자 형태로 보존한다", async () => {
  const csv = new TextEncoder().encode(
    "이름,전화번호,이메일\n비표준 사용자,84563448684,user@example.com",
  );
  const parsed = await parseAddressBookFile(csv, "비표준.csv");
  assert.equal(parsed.skippedRows, 0);
  assert.equal(parsed.contacts[0].normalizedPhone, "84563448684");
});

test("XLSX의 회원명과 휴대전화번호 헤더를 이름·전화번호 컬럼으로 인식한다", async () => {
  const buffer = await writeXlsxFile([
    [{ value: "회원명" }, { value: "휴대전화번호" }, { value: "이메일" }],
    [{ value: "홍길동" }, { value: "010-1234-5678" }, { value: "hong@example.com" }],
  ]).toBuffer();
  const parsed = await parseAddressBookFile(buffer, "주소록.xlsx");
  assert.equal(parsed.contacts.length, 1);
  assert.equal(parsed.contacts[0].normalizedPhone, "01012345678");
  assert.equal(parsed.contacts[0].name, "홍길동");
});
