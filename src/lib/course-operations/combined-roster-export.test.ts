import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";
import { buildCombinedRosterCsv, buildCombinedRosterXlsx, combinedRosterExportFileName } from "./combined-roster-export";
import type { CombinedCourseRosterRow } from "./types";
import { filterRosterRows, sortRosterRows } from "@/lib/jobs/filter";
import { EMPTY_ROSTER_FILTERS } from "@/lib/jobs/types";

function row(id: string, name: string, sourceJobId = "job-a"): CombinedCourseRosterRow {
  return {
    id, sourceJobId, sourceJobName: sourceJobId === "job-a" ? "첫째 명단" : "둘째 명단",
    sourceRowNumber: 2, normalizedPhone: "01012345678", isDuplicate: false,
    groupChatJoined: false, isExtraParticipant: false, isManuallyAdded: false,
    memo: '쉼표, 따옴표 "확인"\n다음 줄',
    values: { customerName: name, courseName: "", optionName: "기본반", phone: "01012345678", email: "member@example.com", referrer: "추천인", source: "유튜브", adMedia: "광고" },
  };
}

test("CSV는 필터·출처·정렬 결과만 저장하고 중복 전화번호도 행 단위로 보존한다", () => {
  const rows = [row("1", "홍길동"), row("2", "김회원"), row("3", "이회원", "job-b"), { ...row("4", "박회원"), groupChatJoined: true }];
  const filtered = sortRosterRows(filterRosterRows(rows, { ...EMPTY_ROSTER_FILTERS, groupChat: "notJoined", optionName: "기본반", source: "유튜브" }), "nameAsc")
    .filter((item) => (item as CombinedCourseRosterRow).sourceJobId === "job-a") as CombinedCourseRosterRow[];
  const csv = buildCombinedRosterCsv(filtered, "통합 강의");
  assert.ok(csv.startsWith("\uFEFF"));
  const records = parse(csv, { bom: true }) as string[][];
  assert.equal(records.length, 3);
  assert.deepEqual(records.slice(1).map((record) => record[1]), ["김회원", "홍길동"]);
  assert.equal(records[1][0], "통합 강의");
  assert.equal(records[1][2], "첫째 명단");
  assert.equal(records[1][3], "010-1234-5678");
  assert.equal(records[1][9], "미참여");
  assert.equal(records[1][10], rows[0].memo);
});

test("엑셀은 모든 열과 문자열을 보존하고 CSV의 수식 문자는 안전하게 처리한다", async () => {
  const item = { ...row("1", '=HYPERLINK("example")'), groupChatJoined: true };
  const blob = await buildCombinedRosterXlsx([item], "강의");
  const records = await readSheet(Buffer.from(await blob.arrayBuffer()), 1);
  assert.deepEqual(records[0], ["강의명", "이름", "출처 명단", "연락처", "이메일", "옵션명", "추천인", "유입 경로", "광고 매체", "단톡방", "비고"]);
  assert.deepEqual(records[1], ["강의", item.values.customerName, "첫째 명단", "010-1234-5678", "member@example.com", "기본반", "추천인", "유튜브", "광고", "참여", item.memo]);
  const csv = parse(buildCombinedRosterCsv([item], "강의"), { bom: true }) as string[][];
  assert.equal(csv[1][1], `'${item.values.customerName}`);
  assert.equal((parse(buildCombinedRosterCsv([], "강의"), { bom: true }) as string[][]).length, 1);
  assert.equal(combinedRosterExportFileName("강의/이름", 2, "xlsx"), "강의_이름-통합명단-필터결과-2명.xlsx");
});
