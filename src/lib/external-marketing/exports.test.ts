import assert from "node:assert/strict";
import test from "node:test";

import { PDFDocument } from "pdf-lib";
import readXlsxFile from "read-excel-file/node";

import { buildExternalMarketingPdf, buildExternalMarketingXlsx } from "./exports";
import type { ExternalMarketingProject } from "./model";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";

const project: ExternalMarketingProject = {
  dashboardId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  courseName: "외부 마케팅 강의",
  instructorName: "김강사",
  cohort: "3기",
  landingPages: [{ channel: "Google", url: "https://example.com/google" }],
  creativeDriveUrl: "https://drive.google.com/example",
  intakeToken: "a".repeat(48),
  publicToken: "b".repeat(48),
  intakeEnabled: true,
  publicEnabled: true,
  updatedAt: "2026-10-22T00:00:00Z",
};

const dashboard: AdPerformanceDashboardData = {
  id: project.dashboardId,
  course: null,
  courses: [],
  startDate: "2026-10-01",
  totalBudget: 30_000_000,
  organicChannels: [],
  sheetState: null,
  metrics: [{
    metricDate: "2026-10-20",
    googleImpressions: 600,
    metaImpressions: 400,
    googleClicks: 60,
    metaClicks: 40,
    googleAdLeads: 6,
    metaAdLeads: 4,
    googleSpend: 120_000,
    metaSpend: 80_000,
    googleLandingLeads: 12,
    metaLandingLeads: 8,
    adminCumulativeLeads: 20,
    chatRoomMembers: 30,
    organicLeads: {},
  }],
};

test("외부 공개 보고서를 숫자 형식의 엑셀로 만든다", async () => {
  const workbook = await buildExternalMarketingXlsx(project, dashboard);
  const [sheet] = await readXlsxFile(workbook);
  assert.equal(sheet.data[0][0], project.courseName);
  assert.equal(sheet.data[3][1], 1_000);
  assert.equal(sheet.data[3][5], 200_000);
});

test("외부 공개 보고서를 A4 가로 PDF로 만든다", async () => {
  const bytes = await buildExternalMarketingPdf(project, dashboard);
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  assert.ok(page.getWidth() > page.getHeight());
  assert.equal(pdf.getTitle(), `${project.courseName} 광고집행 결과`);
});
