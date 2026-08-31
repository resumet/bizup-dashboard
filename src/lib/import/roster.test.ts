import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import writeXlsxFile from "write-excel-file/node";

import {
  analyzeRosterCsv,
  analyzeRosterFile,
  mapHeaders,
  normalizePhone,
  normalizePhoneForStorage,
  parseRosterCsv,
} from "./roster";

test("국내 전화번호 표현을 표준 형식으로 변환한다", () => {
  assert.equal(normalizePhone("010-2589-3353"), "01025893353");
  assert.equal(normalizePhone("+82 10 2589 3353"), "01025893353");
  assert.equal(normalizePhone("02-123-4567"), null);
  assert.equal(normalizePhone("-"), null);
  assert.equal(normalizePhoneForStorage("84563448684"), "84563448684");
});

test("비표준 전화번호는 보존하고 전화번호가 없는 행만 제외한다", () => {
  const csv = [
    "이름,전화번호,이메일",
    "정상 사용자,010-1111-2222,valid@example.com",
    "누락 사용자,,missing@example.com",
    "비표준 사용자,84563448684,invalid@example.com",
  ].join("\n");
  const { preview, records } = analyzeRosterCsv(
    new TextEncoder().encode(csv),
    "전화번호오류.csv",
  );

  assert.equal(preview.summary.totalRows, 3);
  assert.equal(preview.summary.validRows, 2);
  assert.equal(preview.summary.errorRows, 1);
  assert.equal(preview.preview[0].customerName, "정상 사용자");
  assert.equal(preview.preview[0].email, "valid@example.com");
  assert.equal(preview.preview[0].phone, "01011112222");
  assert.equal(preview.errors[0].originalValue, "");
  assert.equal(records.length, 2);
  assert.equal(records[0].normalizedPhone, "01011112222");
  assert.equal(records[1].normalizedPhone, "84563448684");
  assert.equal(records[0].sourceRowNumber, 2);
});

test("샘플 헤더를 표준 컬럼에 자동 매핑한다", () => {
  const mapping = mapHeaders(["강의명", "옵션명", "이름", "이메일", "연락처", "RS 추천인(신규유저)", "유입 경로", "광고 매체"]);
  assert.equal(mapping.phone, "연락처");
  assert.equal(mapping.customerName, "이름");
  assert.equal(mapping.referrer, "RS 추천인(신규유저)");
});

test("전화번호 헤더 네 가지를 모두 전화번호 컬럼으로 인식한다", () => {
  for (const header of [
    "연락처",
    "휴대전화번호",
    "전화번호",
    "휴대폰번호",
  ]) {
    assert.equal(mapHeaders(["이름", header, "이메일"]).phone, header);
  }
});

test("실제 샘플 CSV 43행을 오류 없이 분석한다", async () => {
  const path = "docs/플랫폼트리x맹렬-AI수익화퍼널마케팅실전클래스-수강생명단-0826.csv";
  const bytes = await readFile(path);
  const preview = parseRosterCsv(bytes, path);
  assert.equal(preview.summary.totalRows, 43);
  assert.equal(preview.summary.validRows, 43);
  assert.equal(preview.summary.errorRows, 0);
  assert.equal(preview.summary.duplicateGroups, 0);
  assert.equal(preview.mapping.phone, "연락처");
  assert.equal(preview.preview[0].source, "");
});

test("상세 저장용 데이터에는 마스킹되지 않은 43개 유효 행과 원본 행 번호가 포함된다", async () => {
  const path = "docs/플랫폼트리x맹렬-AI수익화퍼널마케팅실전클래스-수강생명단-0826.csv";
  const bytes = await readFile(path);
  const { records } = analyzeRosterCsv(bytes, path);
  assert.equal(records.length, 43);
  assert.equal(records[0].sourceRowNumber, 2);
  assert.match(records[0].normalizedPhone, /^010\d{8}$/);
  assert.equal(records[0].isDuplicate, false);
});

test("XLSX 수강생 명단도 CSV와 동일한 규칙으로 분석한다", async () => {
  const buffer = await writeXlsxFile([
    [{ value: "이름" }, { value: "연락처" }, { value: "이메일" }],
    [
      { value: "홍길동" },
      { value: "010-1111-2222" },
      { value: "hong@example.com" },
    ],
  ]).toBuffer();
  const { preview, records } = await analyzeRosterFile(
    buffer,
    "신규명단.xlsx",
  );
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.file.name, "신규명단.xlsx");
  assert.equal(records[0].normalizedPhone, "01011112222");
  assert.equal(records[0].normalizedValues.customerName, "홍길동");
});
