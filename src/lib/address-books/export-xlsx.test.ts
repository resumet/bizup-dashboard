import assert from "node:assert/strict";
import test from "node:test";

import readXlsxFile from "read-excel-file/node";

import { buildAddressBookXlsx } from "./export-xlsx";

test("주소록 XLSX의 전화번호를 하이픈 형식의 문자열로 보존한다", async () => {
  const buffer = await buildAddressBookXlsx([
    {
      name: "홍길동",
      normalized_phone: "01012345678",
      email: "hong@example.com",
    },
  ]);
  const [sheet] = await readXlsxFile(buffer);
  const matrix = sheet.data;

  assert.deepEqual(matrix[0], ["이름", "전화번호", "이메일"]);
  assert.equal(matrix[1][1], "010-1234-5678");
});
