import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCreativeRows, parseCreativeRows, assignCreativeInstructors, groupCreativeRows, summarizeCreativeRows, creativeStatusTone } from "./model";

const google = ["일", "캠페인", "광고그룹", "광고 이름", "광고 상태", "광고 유형", "비용", "노출수", "클릭수", "전환", "webinarName"];
const meta = ["date", "campaignName", "adSetName", "adName", "status", "adCost", "impression", "linkClick", "leads", "webinarName"];

test("소재별 보기는 날짜·캠페인·그룹이 달라도 광고 이름이 같으면 합산한다", () => {
  const rows = parseCreativeRows("meta", [meta,
    ["2026-11-14", "c1", "g1", "광고 A", "ACTIVE", "100", "1000", "10", "1.5", "미닝웨비나"],
    ["2026-11-15", "c2", "g2", "광고 A", "PAUSED", "200", "2000", "20", "2.5", "미닝웨비나"],
    ["2026-11-15", "c3", "g3", "광고 A", "ACTIVE", "300", "3000", "30", "", "다른웨비나"],
    ["2026-11-15", "c1", "g1", "광고 B", "ACTIVE", "50", "500", "0", "", "미닝웨비나"],
  ]);
  const original = structuredClone(rows);
  const result = aggregateCreativeRows(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(summarizeCreativeRows([result[0]]), { cost: 600, impressions: 6000, clicks: 60, conversions: 4 });
  assert.deepEqual(result[0].statuses, ["ACTIVE", "PAUSED"]);
  assert.equal(result[1].conversions, null);
  assert.deepEqual(summarizeCreativeRows(result), summarizeCreativeRows(rows));
  assert.deepEqual(rows, original);
  assert.equal(aggregateCreativeRows(rows.filter(row => row.date === "2026-11-14"))[0].cost, 100);
});

test("동일 광고 이름도 다른 강사·매체와 섞지 않고 최근 상태만 표시한다", () => {
  const base = parseCreativeRows("meta", [meta, ["2026-11-14", "c", "g", "광고 A", "ACTIVE", "1", "2", "3", "0", "웨비나"]])[0];
  const result = aggregateCreativeRows([
    { ...base, instructor: "강사 A" }, { ...base, instructor: "강사 A", date: "2026-11-15", status: "PAUSED" },
    { ...base, instructor: "강사 B" }, { ...base, instructor: "강사 A", platform: "google" },
  ]);
  assert.equal(result.length, 3);
  const metaA = result.find(row => row.instructor === "강사 A" && row.platform === "meta")!;
  assert.equal(metaA.cost, 2);
  assert.deepEqual(metaA.statuses, ["PAUSED"]);
  assert.equal(metaA.conversions, 0);
});

test("상세 표 합계는 100행을 넘어도 전체 행을 더하고 빈 값과 0을 구분한다", () => {
  const rows = parseCreativeRows("meta", [meta, ...Array.from({ length: 101 }, () => ["2026-11-15", "c", "g", "a", "ACTIVE", "1.5", "10", "0", "", "미닝웨비나"])]);
  assert.deepEqual(summarizeCreativeRows(rows), { cost: 151.5, impressions: 1010, clicks: 0, conversions: null });
  assert.deepEqual(summarizeCreativeRows(rows.slice(0, 2)), { cost: 3, impressions: 20, clicks: 0, conversions: null });
});

test("상태 칩은 활성과 비활성·게재불가를 혼동하지 않는다", () => {
  for (const status of ["사용중", "ACTIVE", "delivering"]) assert.equal(creativeStatusTone(status), "green");
  assert.equal(creativeStatusTone("not_delivering"), "red");
  assert.equal(creativeStatusTone("PAUSED"), "amber");
  assert.equal(creativeStatusTone("pending_review"), "blue");
  for (const status of ["INACTIVE", "unknown", ""]) assert.equal(creativeStatusTone(status), "gray");
});

test("실제 Google 한국어 헤더와 날짜·소수 전환·빈 숫자를 읽는다", () => {
  const rows = parseCreativeRows("google", [google, [new Date("2026-11-15T00:00:00Z"), "campaign", "group", "ad", "사용중", "동영상", "₩1,234", "500", "0", "1.5", "미닝웨비나"], []]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cost, 1234);
  assert.equal(rows[0].clicks, 0);
  assert.equal(rows[0].conversions, 1.5);
  assert.equal(rows[0].date, "2026-11-15");
  assert.equal(assignCreativeInstructors(rows, [])[0].instructor, "미닝");
});
test("Meta 원본 빈 값과 0을 구분하고 동일 광고 행을 지우지 않는다", () => {
  const row = ["2026-11-15", "campaign", "set", "ad", "not_delivering", "1,000", "100", "", "0", "김선아웨비나"];
  const rows = parseCreativeRows("meta", [meta, row, row]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].clicks, null);
  assert.equal(rows[0].conversions, 0);
  assert.equal(groupCreativeRows(rows, "ad")[0][1].length, 2);
});
test("필수 열·날짜·숫자가 잘못되면 부분 저장용 데이터를 반환하지 않는다", () => {
  assert.throws(() => parseCreativeRows("google", [meta]), /필수 열/u);
  assert.throws(() => parseCreativeRows("meta", [meta, ["2026-02-30"]]), /날짜/u);
  assert.throws(() => parseCreativeRows("meta", [meta, ["2026-11-15", "c", "g", "a", "s", "invalid"]]), /숫자/u);
});
test("강사 열, 등록 강의명, 웨비나 이름으로 분류하고 미분류 데이터를 보존한다", () => {
  const rows = parseCreativeRows("meta", [[...meta, "강사명"],
    ["2026-11-15", "c", "g", "a", "s", "", "", "", "", "미닝웨비나", "명시 강사"],
    ["2026-11-14", "c", "g", "a", "s", "", "", "", "", "강의 A"],
    ["2026-11-13", "c", "g", "a", "s", "", "", "", "", "라스트원웨비나"],
    ["2026-11-12", "c", "g", "a", "s", "", "", "", "", "모름"],
  ]);
  const assigned = assignCreativeInstructors(rows, [{ name: "강의 A", instructor_name: "강사 A" }]);
  assert.deepEqual(assigned.map(row => row.instructor), ["명시 강사", "강사 A", "라스트원", "강사 미분류"]);
  assert.deepEqual(groupCreativeRows(assigned.reverse(), "date").map(([date]) => date), ["2026-11-15", "2026-11-14", "2026-11-13", "2026-11-12"]);
});
