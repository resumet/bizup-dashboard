import assert from "node:assert/strict";
import test from "node:test";
import { koreanHolidaysForDates } from "./holidays";

test("대한민국 공휴일은 해당 날짜와 이름만 달력에 반환한다", async () => {
  const holidays = await koreanHolidaysForDates(["2026-03-01", "2026-03-02", "2026-03-03"]);

  assert.deepEqual(holidays["2026-03-01"], ["3ㆍ1절"]);
  assert.deepEqual(holidays["2026-03-02"], ["대체공휴일(3ㆍ1절)"]);
  assert.equal(holidays["2026-03-03"], undefined);
});

test("공휴일 프리셋이 아직 없는 연도도 달력 렌더링을 막지 않는다", async () => {
  assert.deepEqual(await koreanHolidaysForDates(["2099-01-01"]), {});
});
