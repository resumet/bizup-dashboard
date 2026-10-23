import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import writeXlsxFile, { type Row } from "write-excel-file/node";

import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";
import type { ExternalMarketingProject } from "./model";
import { buildExternalMarketingReportRows, buildExternalMarketingReportTotalRow, type ExternalMarketingReportRow } from "./report";

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
function won(value: number | null) { return value === null ? "-" : `${number.format(Math.round(value))}원`; }
function percent(value: number | null) { return value === null ? "-" : `${rate.format(value)}%`; }
function safeName(value: string) { return (value || "광고집행결과").replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 80); }

export function externalMarketingExportFilename(project: ExternalMarketingProject, extension: "xlsx" | "pdf") {
  return `${safeName(project.courseName)}_광고집행결과.${extension}`;
}

export async function buildExternalMarketingXlsx(project: ExternalMarketingProject, dashboard: AdPerformanceDashboardData) {
  const headers = ["날짜", "총 광고노출", "광고클릭", "클릭전환율", "랜딩전환율", "광고집행비용", "랜딩접수DB", "오늘 단톡방 입장인원", "누적 단톡방 인원", "광고DB당단가", "Google 랜딩DB당단가", "Meta 랜딩DB당단가", "랜딩접수DB단가", "톡방접수 DB당단가"];
  const rows: Row[] = [
    [{ value: project.courseName || "광고집행 결과", fontWeight: "bold" }, ...Array.from({ length: headers.length - 1 }, () => null)],
    [`강사명 ${project.instructorName || "-"} · 관계사 ${project.affiliateName || "-"} · 담당PM ${project.projectManager || "-"} · 기수 ${project.cohort || "-"} · 광고 시작일 ${dashboard.startDate}`, ...Array.from({ length: headers.length - 1 }, () => null)],
    headers.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E2E8F0", align: "center" as const })),
  ];
  const reportRows = buildExternalMarketingReportRows(dashboard.metrics);
  const exportRows = reportRows.length
    ? [buildExternalMarketingReportTotalRow(dashboard.metrics), ...reportRows]
    : [];
  for (const item of exportRows) {
    rows.push([
      item.metricDate,
      item.impressions,
      item.clicks,
      { value: item.clickConversionRate === null ? undefined : item.clickConversionRate / 100, format: "0.00%" },
      { value: item.landingConversionRate === null ? undefined : item.landingConversionRate / 100, format: "0.00%" },
      item.spend,
      item.landingReceptionDb,
      item.chatRoomEntrants,
      item.chatRoomCumulative,
      item.adDbUnitCost === null ? null : Math.round(item.adDbUnitCost),
      item.googleLandingDbUnitCost === null ? null : Math.round(item.googleLandingDbUnitCost),
      item.metaLandingDbUnitCost === null ? null : Math.round(item.metaLandingDbUnitCost),
      item.landingReceptionDbUnitCost === null ? null : Math.round(item.landingReceptionDbUnitCost),
      item.chatReceptionDbUnitCost === null ? null : Math.round(item.chatReceptionDbUnitCost),
    ]);
  }
  return writeXlsxFile(rows, {
    sheet: "광고집행 결과",
    stickyRowsCount: 3,
    columns: [{ width: 15 }, ...Array.from({ length: headers.length - 1 }, () => ({ width: 20 }))],
  }).toBuffer();
}

const PAGE: [number, number] = [841.89, 595.28];
const columns = [50, 55, 48, 53, 53, 64, 54, 54, 54, 62, 88, 76, 80];
const headers = ["날짜", "총 광고노출", "광고클릭", "클릭전환율", "랜딩전환율", "광고집행비용", "랜딩접수DB", "오늘 단톡방 입장인원", "누적 단톡방 인원", "광고DB당단가", "랜딩DB당단가(G/M)", "랜딩접수DB단가", "톡방접수 DB당단가"];

function fit(value: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let text = value;
  while (text && font.widthOfTextAtSize(`${text}…`, size) > width) text = text.slice(0, -1);
  return `${text}…`;
}

function drawText(page: PDFPage, font: PDFFont, value: string, x: number, y: number, width: number, size = 7, align: "left" | "right" | "center" = "right", color = rgb(0.12, 0.15, 0.2)) {
  const text = fit(value, font, size, width - 6);
  const textWidth = font.widthOfTextAtSize(text, size);
  const textX = align === "left" ? x + 3 : align === "center" ? x + (width - textWidth) / 2 : x + width - textWidth - 3;
  page.drawText(text, { x: textX, y, size, font, color });
}

function rowValues(row: ExternalMarketingReportRow) {
  return [row.metricDate, number.format(row.impressions), number.format(row.clicks), percent(row.clickConversionRate), percent(row.landingConversionRate), won(row.spend), number.format(row.landingReceptionDb), row.chatRoomEntrants === null ? "-" : number.format(row.chatRoomEntrants), row.chatRoomCumulative === null ? "-" : number.format(row.chatRoomCumulative), won(row.adDbUnitCost), `G ${won(row.googleLandingDbUnitCost)} / M ${won(row.metaLandingDbUnitCost)}`, won(row.landingReceptionDbUnitCost), won(row.chatReceptionDbUnitCost)];
}

function drawTableHeader(page: PDFPage, font: PDFFont, y: number) {
  let x = 25;
  headers.forEach((header, index) => {
    page.drawRectangle({ x, y: y - 18, width: columns[index], height: 18, color: rgb(0.91, 0.93, 0.96), borderColor: rgb(0.75, 0.78, 0.83), borderWidth: 0.4 });
    drawText(page, font, header, x, y - 12, columns[index], 6.2, "center");
    x += columns[index];
  });
  return y - 18;
}

function drawTableRow(page: PDFPage, font: PDFFont, row: ExternalMarketingReportRow, y: number, total = false) {
  let x = 25;
  rowValues(row).forEach((value, index) => {
    page.drawRectangle({ x, y: y - 17, width: columns[index], height: 17, ...(total ? { color: rgb(0.94, 0.95, 0.97) } : {}), borderColor: rgb(0.82, 0.84, 0.88), borderWidth: 0.35 });
    drawText(page, font, value, x, y - 11.5, columns[index], 6.1, index === 0 ? "center" : "right");
    x += columns[index];
  });
  return y - 17;
}

export async function buildExternalMarketingPdf(project: ExternalMarketingProject, dashboard: AdPerformanceDashboardData) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "public", "fonts", "NanumMyeongjo-Regular.ttf"));
  const font = await pdf.embedFont(fontBytes);
  pdf.setLanguage("ko-KR");
  pdf.setTitle(`${project.courseName || "광고집행 결과"} 광고집행 결과`);
  pdf.setCreator("BizUp");

  const summary = summarizeAdPerformance(dashboard.metrics, dashboard.totalBudget);
  const reportRows = buildExternalMarketingReportRows(dashboard.metrics);
  let page = pdf.addPage(PAGE);
  page.drawText(project.courseName || "광고집행 결과", { x: 28, y: 548, size: 22, font, color: rgb(0.08, 0.11, 0.16) });
  drawText(page, font, `강사명 ${project.instructorName || "-"}   |   관계사 ${project.affiliateName || "-"}   |   담당PM ${project.projectManager || "-"}   |   기수 ${project.cohort || "-"}   |   광고 시작일 ${dashboard.startDate}`, 28, 523, 786, 8.5, "left", rgb(0.35, 0.38, 0.44));
  const landingPageSummary = project.landingPages.length
    ? project.landingPages.map((item) => `${item.channel}: ${item.url}`).join("   |   ")
    : "-";
  drawText(page, font, `채널별 랜딩페이지   ${landingPageSummary}`, 28, 506, 786, 7.2, "left", rgb(0.35, 0.38, 0.44));
  drawText(page, font, `광고소재 드라이브   ${project.creativeDriveUrl || "-"}`, 28, 492, 786, 7.2, "left", rgb(0.35, 0.38, 0.44));
  const cards = [
    ["전체 집행비용 누적", won(summary.spend)], ["잔여 예산", won(summary.remainingBudget)], ["전체DB 총합계", `${number.format(summary.totalDatabaseLeads)}건`],
    ["누적 단톡방 인원", `${number.format(summary.latestChatRoomMembers)}명`], ["랜딩접수DB단가", won(summary.paidLandingLeadCost)], ["톡방접수DB단가", won(summary.chatRoomEntrantCost)],
  ];
  cards.forEach(([label, value], index) => {
    const cardWidth = 250;
    const x = 28 + (index % 3) * 262;
    const y = 425 - Math.floor(index / 3) * 63;
    page.drawRectangle({ x, y, width: cardWidth, height: 51, color: rgb(0.97, 0.975, 0.985), borderColor: rgb(0.86, 0.88, 0.91), borderWidth: 0.5 });
    page.drawText(label, { x: x + 10, y: y + 32, size: 7.5, font, color: rgb(0.42, 0.45, 0.51) });
    page.drawText(value, { x: x + 10, y: y + 12, size: 12, font, color: rgb(0.08, 0.11, 0.16) });
  });
  page.drawText("광고집행 결과", { x: 28, y: 330, size: 13, font, color: rgb(0.08, 0.11, 0.16) });
  let y = drawTableHeader(page, font, 314);
  if (reportRows.length) {
    y = drawTableRow(page, font, buildExternalMarketingReportTotalRow(dashboard.metrics), y, true);
  }
  for (const row of reportRows) {
    if (y < 38) {
      page = pdf.addPage(PAGE);
      page.drawText(`${project.courseName || "광고집행 결과"} · 광고집행 결과`, { x: 25, y: 562, size: 12, font });
      y = drawTableHeader(page, font, 545);
    }
    y = drawTableRow(page, font, row, y);
  }
  return new Uint8Array(await pdf.save());
}
