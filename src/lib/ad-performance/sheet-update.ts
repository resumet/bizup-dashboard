import { adPerformanceSheetRow } from "./sheet-row";
import { resolveAdPerformanceSourceDate } from "./sheet-workspace";
import { buildMeaningSheetHeaders } from "@/lib/admin/meaning-sheet-headers";
import { formatMeaningSheetSourceCell } from "@/lib/admin/meaning-sheet-metrics";
import type { AdPerformanceSheetState, AdPerformanceTrackingImport } from "./types";

export type SheetChange = { date: string; field: string; before: string | number | null; after: string | number | null };
export type SheetUpdatePreview = { version: number; fingerprint: string; changes: SheetChange[] };

export function applyTrackingToSheet(
  state: AdPerformanceSheetState,
  tracking: AdPerformanceTrackingImport | null,
  startDate: string,
): AdPerformanceSheetState {
  const next = { ...state, tracking, manualInputs: { ...state.manualInputs } };
  if (!tracking?.bizupDbCumulativeDate) return next;
  const through = tracking.bizupDbCumulativeDate;
  if (tracking.applicationCountsByDate) {
    // The application list is a complete snapshot: dates without applications become zero.
    next.tracking = { ...tracking, dailyByDate: { ...tracking.dailyByDate } };
    for (const row of state.sourceRows.slice(2)) {
      const date = resolveAdPerformanceSourceDate(row[0], startDate);
      if (!date || date > through) continue;
      const monthDay = date.slice(5);
      const key = next.tracking.dailyByDate[monthDay] && next.tracking.dailyByDate[monthDay].fullDate !== date ? date : monthDay;
      if (!next.tracking.dailyByDate[key]) next.tracking.dailyByDate[key] = {
        fullDate: date, googleLandingDb: 0, metaLandingDb: 0,
        landingDbImported: true, organicByChannel: {},
      };
    }
    const counts = Object.entries(tracking.applicationCountsByDate).sort(([a], [b]) => a.localeCompare(b));
    const dates = new Set([...Object.keys(next.manualInputs), through]);
    for (const row of state.sourceRows.slice(2)) {
      const date = resolveAdPerformanceSourceDate(row[0], startDate);
      if (date) dates.add(date);
    }
    let index = 0;
    let cumulative = 0;
    for (const date of [...dates].filter(date => date <= through).sort()) {
      while (index < counts.length && counts[index][0] <= date) cumulative += counts[index++][1];
      next.manualInputs[date] = {
        bizupDbCumulative: cumulative,
        chatMembersCumulative: next.manualInputs[date]?.chatMembersCumulative ?? null,
      };
    }
  } else if (tracking.bizupDbCumulativeCount !== undefined) {
    next.manualInputs[through] = {
      bizupDbCumulative: tracking.bizupDbCumulativeCount,
      chatMembersCumulative: next.manualInputs[through]?.chatMembersCumulative ?? null,
    };
  }
  return next;
}

function reviewValues(state: AdPerformanceSheetState, startDate: string) {
  const result = new Map<string, Record<string, string | number | null>>();
  const headers = buildMeaningSheetHeaders(state.sourceRows.slice(0, 2));
  const labels = headers.top.flatMap(cell => Array.from({ length: cell.columnSpan }, () => cell.label));
  const details = ["", ...headers.bottom.map(cell => cell.label)];
  const rows = new Map<string, string[]>();
  const sourceRowSet = new Set(state.sourceRows.slice(2));
  state.sourceRows.slice(2).forEach((row, index) => rows.set(resolveAdPerformanceSourceDate(row[0], startDate) ?? `원본 ${index + 3}행`, row));
  for (const date of [...Object.keys(state.manualInputs), ...Object.values(state.tracking?.dailyByDate ?? {}).map(daily => daily.fullDate)]) {
    if (!rows.has(date)) rows.set(date, [date]);
  }
  for (const [date, row] of rows) {
    const values: Record<string, string | number | null> = {};
    values["원본 날짜 행"] = sourceRowSet.has(row) ? "있음" : null;
    values["원본 날짜 행"] = state.sourceRows.includes(row) ? "있음" : null;
    for (let i = 1; i < 14; i++) {
      const label = i === 1 ? labels[i] : `${labels[i]} · ${details[i]}`;
      values[`${label} (${String.fromCharCode(65 + i)}열)`] = formatMeaningSheetSourceCell(row[i] ?? "", i) || null;
    }
    const view = adPerformanceSheetRow(row, startDate, state);
    values["랜딩접수 DB · 구글"] = view.hasLandingDb ? view.landingDb.googleLandingDb : null;
    values["랜딩접수 DB · 메타"] = view.hasLandingDb ? view.landingDb.metaLandingDb : null;
    values["랜딩접수총DB (광고)"] = view.importedTotals?.landing ?? null;
    for (const channel of state.tracking?.organicChannels ?? []) values[`오가닉 · ${channel}`] = view.importedValues ? view.importedValues.organicByChannel[channel] ?? 0 : null;
    values["오가닉총합"] = view.importedTotals?.organic ?? null;
    values["DB총합"] = view.importedTotals?.database ?? null;
    values["누적비즈업 DB"] = view.manualInput?.bizupDbCumulative ?? null;
    values["톡방누적 인원"] = view.manualInput?.chatMembersCumulative ?? null;
    values["톡방입장 인원"] = view.chatEntries;
    const costs = [
      ["광고DB당 단가 · 구글", view.unitCosts.googleAdDbUnitCost],
      ["광고DB당 단가 · 메타", view.unitCosts.metaAdDbUnitCost],
      ["랜딩DB당 단가 · 구글", view.unitCosts.googleLandingDbUnitCost],
      ["랜딩DB당 단가 · 메타", view.unitCosts.metaLandingDbUnitCost],
      ["광고DB-랜딩DB 단가차이 · 구글", view.unitCosts.googleUnitCostDifference],
      ["광고DB-랜딩DB 단가차이 · 메타", view.unitCosts.metaUnitCostDifference],
      ["랜딩접수 DB단가", view.unitCosts.landingReceptionDbUnitCost],
      ["톡방접수 DB단가", view.unitCosts.chatReceptionDbUnitCost],
    ] as const;
    for (const [label, value] of costs) values[label] = value === null ? null : Math.round(value);
    result.set(date, values);
  }
  return result;
}

export function compareSheetUpdates(before: AdPerformanceSheetState, after: AdPerformanceSheetState, startDate: string): SheetChange[] {
  const oldRows = reviewValues(before, startDate);
  const newRows = reviewValues(after, startDate);
  const changes: SheetChange[] = [];
  for (const date of [...new Set([...oldRows.keys(), ...newRows.keys()])].sort()) {
    const oldValues = oldRows.get(date) ?? {};
    const newValues = newRows.get(date) ?? {};
    for (const field of new Set([...Object.keys(oldValues), ...Object.keys(newValues)])) {
      const previous = oldValues[field] ?? null;
      const next = newValues[field] ?? null;
      if (previous !== next) changes.push({ date, field, before: previous, after: next });
    }
  }
  return changes;
}
