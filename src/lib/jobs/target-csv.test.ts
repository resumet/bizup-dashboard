import assert from "node:assert/strict";
import test from "node:test";

import { buildTargetContactCsv, targetContactCsvFileName } from "./target-csv";

test("단톡방 미참여자 이름과 전화번호를 Excel 호환 CSV로 만든다", () => {
  const csv = buildTargetContactCsv([
    {
      normalizedPhone: "01012345678",
      values: { customerName: '홍"길동' },
    },
    {
      normalizedPhone: "021234567",
      values: { customerName: "김영희" },
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(
    csv,
    '\uFEFF"이름","전화번호"\r\n"홍""길동","010-1234-5678"\r\n"김영희","021234567"',
  );
});

test("CSV 파일명에 사용할 수 없는 문자를 안전하게 바꾼다", () => {
  assert.equal(
    targetContactCsvFileName("AI/마케팅:실전"),
    "AI_마케팅_실전-단톡방-미참여자.csv",
  );
  assert.equal(
    targetContactCsvFileName("  "),
    "수강생명단-단톡방-미참여자.csv",
  );
});
