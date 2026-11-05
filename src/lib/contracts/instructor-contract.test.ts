import assert from "node:assert/strict";
import test from "node:test";

import { getContractEndDate, getKoreanDate } from "./instructor-contract";

test("계약 종료일은 시작일 기준 입력한 연수를 더한다", () => {
  assert.equal(getContractEndDate("2026-11-05", 1), "2027-11-05");
  assert.equal(getContractEndDate("2024-02-29", 1), "2025-03-01");
});

test("계약 날짜를 읽기 쉬운 한국어 날짜로 표시한다", () => {
  assert.equal(getKoreanDate("2026-11-05"), "2026년 11월 5일");
});
