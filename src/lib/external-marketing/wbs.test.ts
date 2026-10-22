import assert from "node:assert/strict";
import test from "node:test";
import { externalMarketingWbs, formatWbsCountdown, sortExternalMarketingProjects } from "./wbs";
import { externalMarketingInfoSchema } from "./model";

test("웨비나 기준 21·28·35·37일 전과 서울 날짜 기준 남은 일수를 계산한다", () => {
  const rows = externalMarketingWbs("2026-11-27", "2026-10-23");
  assert.deepEqual(rows.map((row) => row.dueDate), ["2026-11-06", "2026-10-30", "2026-10-23", "2026-10-21"]);
  assert.deepEqual(rows.map((row) => formatWbsCountdown(row.daysLeft)), ["14일 남음", "7일 남음", "오늘", "2일 지남"]);
  assert.equal(externalMarketingWbs("2027-01-05", "2026-12-01")[3].dueDate, "2026-11-29");
  assert.ok(externalMarketingWbs("", "2026-10-23").every((row) => row.daysLeft === null && !row.dueDate));
});

test("웨비나 임박순·최근 종료순·미입력순을 지키고 실제 달력 날짜만 받는다", () => {
  const input = ["", "2026-10-21", "2026-11-10", "2026-10-23", "2026-10-22"].map((webinarDate) => ({ webinarDate }));
  assert.deepEqual(sortExternalMarketingProjects(input, "2026-10-23").map((row) => row.webinarDate), ["2026-10-23", "2026-11-10", "2026-10-22", "2026-10-21", ""]);
  const info = { courseName: "강의", instructorName: "강사", cohort: "1기", landingPages: [], creativeDriveUrl: "" };
  assert.equal(externalMarketingInfoSchema.parse(info).webinarDate, "");
  assert.equal(externalMarketingInfoSchema.safeParse({ ...info, webinarDate: "2026-02-30" }).success, false);
});
