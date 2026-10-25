import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalMarketingProjectSummary } from "@/lib/external-marketing/model";
import { activeExternalMarketingCourses } from "./external-marketing";

function project(
  dashboardId: string,
  advertisingStarted: boolean,
  partial: Partial<ExternalMarketingProjectSummary> = {},
): ExternalMarketingProjectSummary {
  return {
    dashboardId,
    workspaceId: "workspace",
    courseName: "외부 마케팅 강의",
    instructorName: "강사",
    affiliateName: "관계사",
    projectManager: "담당자",
    cohort: "1기",
    webinarDate: "2026-11-01",
    landingPages: [],
    creativeDriveUrl: "",
    previousCohortCreativeNotionUrl: "",
    publicToken: "a".repeat(48),
    publicEnabled: true,
    advertisingStarted,
    updatedAt: "2026-10-25T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    startDate: "2026-10-01",
    totalBudget: 10_000_000,
    spend: 600_000,
    adLeads: 30,
    metricCount: 10,
    paidLandingLeads: 12,
    organicLandingLeads: 5,
    ...partial,
  };
}

test("광고가 시작된 외부 마케팅 강의만 DB 건수와 단가를 계산한다", () => {
  const result = activeExternalMarketingCourses([
    project("active", true),
    project("not-started", false),
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    dashboardId: "active",
    courseName: "외부 마케팅 강의",
    instructorName: "강사",
    cohort: "1기",
    spend: 600_000,
    landingLeads: 12,
    landingLeadCost: 50_000,
    adLeads: 30,
    adLeadCost: 20_000,
  });
});

test("DB가 없으면 단가를 0원이 아닌 미집계 상태로 둔다", () => {
  const [result] = activeExternalMarketingCourses([
    project("empty", true, { adLeads: 0, paidLandingLeads: 0 }),
  ]);

  assert.equal(result.landingLeadCost, null);
  assert.equal(result.adLeadCost, null);
});
