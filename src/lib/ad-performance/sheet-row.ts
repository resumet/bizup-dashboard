import { meaningSheetDateKey } from "@/lib/admin/meaning-tracking";
import {
  calculateChatRoomEntries,
  calculateMeaningSheetImportedTotals,
  calculateMeaningSheetUnitCosts,
  parseMeaningSheetMetricNumber,
} from "@/lib/admin/meaning-sheet-metrics";
import {
  AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT,
  adPerformanceSourceLandingDb,
  resolveAdPerformanceSourceDate,
} from "./sheet-workspace";
import type { AdPerformanceSheetState } from "./types";

function previousIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Shared by the on-screen table and XLSX export so their saved values stay identical.
export function adPerformanceSheetRow(
  row: string[],
  dashboardStartDate: string,
  sheetState: AdPerformanceSheetState | null,
) {
  const manualInputs = sheetState?.manualInputs ?? {};
  const tracking = sheetState?.tracking;
  const organicChannels = tracking?.organicChannels ?? [];
  const metricDate = resolveAdPerformanceSourceDate(
    row[0],
    dashboardStartDate,
  );
  const dateKey = meaningSheetDateKey(row[0]);
  const manualInput = metricDate
    ? manualInputs[metricDate]
    : undefined;
  const previousDateKey = metricDate
    ? previousIsoDate(metricDate)
    : null;
  const previousManualInput = previousDateKey
    ? manualInputs[previousDateKey]
    : undefined;
  const trackedValues = dateKey
      ? tracking?.dailyByDate[dateKey]
      : undefined;
  const importedValues =
    trackedValues?.fullDate === metricDate
      ? trackedValues
      : undefined;
  const sourceLandingDb = adPerformanceSourceLandingDb(row);
  const landingDb = importedValues?.landingDbImported
    ? {
        googleLandingDb: importedValues.googleLandingDb,
        metaLandingDb: importedValues.metaLandingDb,
      }
    : sourceLandingDb;
  const hasSourceLandingDb = Boolean(
    row[14]?.trim() || row[15]?.trim(),
  );
  const hasLandingDb =
    Boolean(importedValues?.landingDbImported) || hasSourceLandingDb;
  const importedTotals = hasLandingDb || importedValues
    ? calculateMeaningSheetImportedTotals(
        {
          ...landingDb,
          organicByChannel:
            importedValues?.organicByChannel ?? {},
        },
        organicChannels,
      )
    : null;
  const chatEntries = calculateChatRoomEntries(
    manualInput?.chatMembersCumulative,
    previousManualInput?.chatMembersCumulative,
  );
  const unitCosts = calculateMeaningSheetUnitCosts({
    totalAdSpend: importedValues
      ? parseMeaningSheetMetricNumber(row[1])
      : null,
    googleAdSpend: importedValues
      ? parseMeaningSheetMetricNumber(row[10])
      : null,
    metaAdSpend: importedValues
      ? parseMeaningSheetMetricNumber(row[11])
      : null,
    googleAdDb: importedValues
      ? parseMeaningSheetMetricNumber(row[12])
      : null,
    metaAdDb: importedValues
      ? parseMeaningSheetMetricNumber(row[13])
      : null,
    googleLandingDb: importedValues
      ? landingDb.googleLandingDb
      : null,
    metaLandingDb: importedValues
      ? landingDb.metaLandingDb
      : null,
    chatEntries: importedValues ? chatEntries : null,
  });
  const visibleSourceRow = row.slice(
    0,
    AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT,
  );
  return { metricDate, manualInput, importedValues, landingDb, hasLandingDb,
    importedTotals, chatEntries, unitCosts, visibleSourceRow };
}
