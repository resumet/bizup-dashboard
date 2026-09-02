import assert from "node:assert/strict";
import test from "node:test";
import readXlsxFile from "read-excel-file/node";

import { buildRosterXlsx } from "./export-xlsx";
import type { RosterRow } from "./types";

test("필터 결과를 한글 헤더가 포함된 XLSX 파일로 생성한다", async () => {
  const rows = [{ id: "1", sourceRowNumber: 2, normalizedPhone: "01011112222", isDuplicate: false, groupChatJoined: false, memo: "재결제 확인", values: { courseName: "AI 실전", optionName: "A", customerName: "홍길동", email: "hong@example.com", phone: "01011112222", referrer: "", source: "검색", adMedia: "네이버" } }] satisfies RosterRow[];
  const buffer = await buildRosterXlsx(rows);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.ok(buffer.length > 1_000);
  const [sheet] = await readXlsxFile(buffer);
  const matrix = sheet.data;
  assert.deepEqual(matrix[0], [
    "강의명",
    "옵션명",
    "고객명",
    "이메일",
    "연락처",
    "추천인",
    "유입 경로",
    "광고 매체",
    "비고",
  ]);
  assert.equal(matrix[1][4], "010-1111-2222");
});
