import assert from "node:assert/strict";
import test from "node:test";

import { nextMetricDate } from "./date";

test("기록 날짜가 순서대로 있지 않아도 가장 늦은 날짜의 다음 날을 선택한다", () => {
  assert.equal(nextMetricDate(["2026-09-27", "2026-09-23", "2026-09-26"], "2026-09-20"), "2026-09-28");
});

test("연말과 윤년의 월말을 UTC 달력 기준으로 넘긴다", () => {
  assert.equal(nextMetricDate(["2026-12-31"], "2026-01-01"), "2027-01-01");
  assert.equal(nextMetricDate(["2028-02-28"], "2028-01-01"), "2028-02-29");
  assert.equal(nextMetricDate(["2028-02-29"], "2028-01-01"), "2028-03-01");
});

test("기록이 없으면 광고 시작일을 사용하고 시작일도 없으면 서울의 오늘을 사용한다", () => {
  assert.equal(nextMetricDate([], "2026-10-13"), "2026-10-13");
  assert.equal(nextMetricDate([], "", new Date("2026-09-26T15:30:00Z")), "2026-09-27");
});
