import assert from "node:assert/strict";
import test from "node:test";
import { parseCreativeRows, assignCreativeInstructors, groupCreativeRows } from "./model";

const google = ["일", "캠페인", "광고그룹", "광고 이름", "광고 상태", "광고 유형", "비용", "노출수", "클릭수", "전환", "webinarName"];
const meta = ["date", "campaignName", "adSetName", "adName", "status", "adCost", "impression", "linkClick", "leads", "webinarName"];

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
