import assert from "node:assert/strict";
import test from "node:test";
import {
  externalMarketingWbs,
  formatExternalMarketingProjectTitle,
  formatExternalMarketingWebinarDate,
  formatWbsCountdown,
  sortExternalMarketingProjects,
} from "./wbs";
import { externalMarketingInfoSchema, externalMarketingPatchSchema } from "./model";

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
  const info = { courseName: "강의", instructorName: "강사", affiliateName: "관계사", projectManager: "담당PM", cohort: "1기", landingPages: [], creativeDriveUrl: "" };
  assert.equal(externalMarketingInfoSchema.parse(info).webinarDate, "");
  assert.equal(externalMarketingInfoSchema.parse({ ...info, previousCohortCreativeNotionUrl: "https://app.notion.com/p/40295b2493eb8021a30aed988ada9312?source=copy_link#40295b2493eb80618c0dc4e7837d93be" }).previousCohortCreativeNotionUrl.includes("app.notion.com"), true);
  assert.equal(externalMarketingInfoSchema.safeParse({ ...info, previousCohortCreativeNotionUrl: "https://example.com/page" }).success, false);
  assert.equal(externalMarketingInfoSchema.safeParse({ ...info, webinarDate: "2026-02-30" }).success, false);
  assert.deepEqual(externalMarketingPatchSchema.parse({ kind: "advertising_started", started: true }), { kind: "advertising_started", started: true });
  assert.equal(externalMarketingPatchSchema.safeParse({ kind: "advertising_started", started: true, publicEnabled: false }).success, false);
});

test("목록의 웨비나 날짜와 제목을 한국 달력 형식으로 표시한다", () => {
  assert.equal(formatExternalMarketingWebinarDate("2026-11-23"), "2026년 11월 23일");
  assert.equal(formatExternalMarketingProjectTitle("마케팅 강의", "2026-11-23", true), "🏃 (11월 23일) 마케팅 강의");
  assert.equal(formatExternalMarketingProjectTitle("미정 강의", "", false), "🛑 (날짜 미입력) 미정 강의");
});
