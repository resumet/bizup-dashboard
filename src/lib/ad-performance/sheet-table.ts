import { buildMeaningSheetHeaders } from "@/lib/admin/meaning-sheet-headers";
import { formatMeaningSheetWon, parseMeaningSheetMetricNumber } from "@/lib/admin/meaning-sheet-metrics";
import { adPerformanceSheetRow } from "./sheet-row";
import { AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT } from "./sheet-workspace";
import type { AdPerformanceSheetState } from "./types";

export type AdPerformanceTableCell = {
  value: string | number | null;
  format: "text" | "number" | "count" | "won" | "percent";
};

const cell = (value: number | null | undefined, format: AdPerformanceTableCell["format"] = "number"): AdPerformanceTableCell => ({ value: value ?? null, format });
const divide = (amount: number | null, count: number | null) => amount === null || count === null || count <= 0 ? null : amount / count;

export function buildAdPerformanceTableHeaders(rows: string[][]) {
  const headers = buildMeaningSheetHeaders(rows);
  const index = headers.top.findIndex((item) => item.key === "columns-12-13");
  headers.top.splice(index, 0, { key: "ad-db-unit-cost", label: "광고접수 DB당 단가", columnSpan: 2 });
  headers.bottom.splice(11, 0,
    { key: "google-ad-db-unit-cost", label: "구글광고", columnSpan: 1 },
    { key: "meta-ad-db-unit-cost", label: "메타광고", columnSpan: 1 });
  return headers;
}

export function adPerformanceTableRow(row: string[], startDate: string, state: AdPerformanceSheetState | null) {
  const detail = adPerformanceSheetRow(row, startDate, state);
  const { manualInput, importedValues, landingDb, hasLandingDb, importedTotals, chatEntries, unitCosts } = detail;
  const source = Array.from({ length: AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT }, (_, index): AdPerformanceTableCell => {
    if (index === 0) return { value: row[0] ?? "", format: "text" };
    const value = parseMeaningSheetMetricNumber(row[index]);
    if (index >= 6 && index <= 9) {
      const isPercentage = row[index]?.includes("%") || (value !== null && Math.abs(value) > 1);
      return cell(value === null ? null : isPercentage ? value / 100 : value, "percent");
    }
    return cell(value, [1, 10, 11].includes(index) ? "won" : index >= 2 && index <= 5 ? "count" : "number");
  });
  const googleCost = divide(parseMeaningSheetMetricNumber(row[10]), parseMeaningSheetMetricNumber(row[12]));
  const metaCost = divide(parseMeaningSheetMetricNumber(row[11]), parseMeaningSheetMetricNumber(row[13]));
  source.splice(12, 0, cell(googleCost, "won"), cell(metaCost, "won"));
  return {
    metricDate: detail.metricDate,
    cells: [
      ...source,
      cell(hasLandingDb ? landingDb.googleLandingDb : null),
      cell(hasLandingDb ? landingDb.metaLandingDb : null),
      cell(importedTotals?.landing),
      ...(state?.tracking?.organicChannels ?? []).map((channel) => cell(importedValues ? importedValues.organicByChannel[channel] ?? 0 : null)),
      cell(importedTotals?.organic),
      cell(importedTotals?.database),
      ...[unitCosts.googleLandingDbUnitCost, unitCosts.metaLandingDbUnitCost,
        unitCosts.googleUnitCostDifference, unitCosts.metaUnitCostDifference].map((value) => cell(value, "won")),
      cell(manualInput?.bizupDbCumulative),
      cell(manualInput?.chatMembersCumulative),
      cell(chatEntries),
      cell(unitCosts.landingReceptionDbUnitCost, "won"),
      cell(unitCosts.chatReceptionDbUnitCost, "won"),
    ],
  };
}

// Sum all dates, including rows outside the current page. Recalculate ratios from
// their total numerators/denominators and take the latest entered cumulative values.
export function adPerformanceTableTotals(rows: string[][], startDate: string, state: AdPerformanceSheetState | null): AdPerformanceTableCell[] {
  const datedRows = rows.map((row) => adPerformanceTableRow(row, startDate, state))
    .filter((row) => row.metricDate !== null)
    .sort((a, b) => a.metricDate!.localeCompare(b.metricDate!));
  const template = adPerformanceTableRow([], startDate, state).cells;
  const totals = template.map((item, index) => {
    const values = datedRows.flatMap((row) => typeof row.cells[index].value === "number" ? [row.cells[index].value as number] : []);
    return { ...item, value: values.length ? values.reduce((sum, value) => sum + value, 0) : null };
  }) as AdPerformanceTableCell[];
  totals[0] = { value: "합계", format: "text" };
  const numeric = (index: number) => typeof totals[index].value === "number" ? totals[index].value as number : null;
  const setRatio = (target: number, numerator: number, denominator: number) => { totals[target].value = divide(numeric(numerator), numeric(denominator)); };
  setRatio(6, 4, 2);
  setRatio(7, 5, 3);
  setRatio(8, 14, 4);
  setRatio(9, 15, 5);
  setRatio(12, 10, 14);
  setRatio(13, 11, 15);
  const offset = state?.tracking?.organicChannels.length ?? 0;
  setRatio(21 + offset, 10, 16);
  setRatio(22 + offset, 11, 17);
  for (const [target, first, second] of [[23 + offset, 12, 21 + offset], [24 + offset, 13, 22 + offset]]) {
    const a = numeric(first), b = numeric(second);
    totals[target].value = a === null || b === null ? null : a - b;
  }
  for (const index of [25 + offset, 26 + offset]) {
    totals[index].value = datedRows.findLast((row) => row.cells[index].value !== null)?.cells[index].value ?? null;
  }
  setRatio(28 + offset, 1, 18);
  setRatio(29 + offset, 1, 27 + offset);
  return totals;
}

export function formatAdPerformanceTableCell({ value, format }: AdPerformanceTableCell) {
  if (typeof value === "string") return value;
  if (format === "won") return formatMeaningSheetWon(value);
  if (value === null) return "";
  if (format === "percent") return `${(value * 100).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}${format === "count" ? "건" : ""}`;
}
