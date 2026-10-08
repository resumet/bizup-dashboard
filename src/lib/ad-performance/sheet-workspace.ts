import {
  meaningSheetDateKey,
  type MeaningTrackingImport,
} from "@/lib/admin/meaning-tracking";
import { parseMeaningSheetMetricNumber } from "@/lib/admin/meaning-sheet-metrics";
import type {
  AdPerformanceSheetManualInput,
  AdPerformanceTrackingImport,
} from "./types";

export const AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT = 14;
export const AD_PERFORMANCE_SOURCE_COLUMN_COUNT = 16;
export const AD_PERFORMANCE_MAX_SOURCE_ROWS = 10_000;
export const AD_PERFORMANCE_MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;
export const AD_PERFORMANCE_MAX_TRACKING_BYTES = 15 * 1024 * 1024;

const seoulDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type AdPerformanceMetricSnapshot = {
  metricDate: string;
  googleImpressions: number;
  metaImpressions: number;
  googleClicks: number;
  metaClicks: number;
  googleAdLeads: number;
  metaAdLeads: number;
  googleSpend: number;
  metaSpend: number;
  googleLandingLeads: number;
  metaLandingLeads: number;
  adminCumulativeLeads: number;
  chatRoomMembers: number | null;
  organicLeadsByName: Record<string, number>;
};

function cellText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "").trim();
}

export function normalizeAdPerformanceSourceRows(
  rows: readonly (readonly unknown[])[],
) {
  if (rows.length > AD_PERFORMANCE_MAX_SOURCE_ROWS) {
    throw new Error(
      `원본 시트는 최대 ${AD_PERFORMANCE_MAX_SOURCE_ROWS.toLocaleString("ko-KR")}행까지 연결할 수 있습니다.`,
    );
  }

  const normalized = rows.map((row) => {
    const cells = row
      .slice(0, AD_PERFORMANCE_SOURCE_COLUMN_COUNT)
      .map(cellText);
    return [
      ...cells,
      ...Array.from(
        { length: AD_PERFORMANCE_SOURCE_COLUMN_COUNT - cells.length },
        () => "",
      ),
    ];
  });

  while (
    normalized.length &&
    normalized.at(-1)?.every((cell) => !cell.trim())
  ) {
    normalized.pop();
  }
  return normalized;
}

export function currentSeoulDate(value = new Date()) {
  const parts = Object.fromEntries(
    seoulDateFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function extractGoogleSpreadsheetId(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Google Sheets URL을 확인해 주세요.");
  }

  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("docs.google.com의 Google Sheets URL만 연결할 수 있습니다.");
  }
  const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/u.exec(
    url.pathname,
  );
  if (!match) throw new Error("Google Sheets 문서 URL 형식이 올바르지 않습니다.");
  return match[1];
}

export function canonicalGoogleSpreadsheetUrl(spreadsheetId: string) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function sourceDateParts(value: unknown) {
  const text = cellText(value).replace(/\s+/gu, "");
  const full = text.match(
    /^(\d{4})[.\-/년](\d{1,2})[.\-/월](\d{1,2})일?$/u,
  );
  if (full) {
    return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
  }
  const monthDay = text.match(/^(\d{1,2})(?:월|[.\-/])(\d{1,2})일?$/u);
  if (!monthDay) return null;
  return { year: null, month: Number(monthDay[1]), day: Number(monthDay[2]) };
}

function isoDate(year: number, month: number, day: number) {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validIsoDate(value) ? value : null;
}

export function resolveAdPerformanceSourceDate(
  value: unknown,
  dashboardStartDate: string,
) {
  const parts = sourceDateParts(value);
  if (!parts || !validIsoDate(dashboardStartDate)) return null;
  if (parts.year !== null) return isoDate(parts.year, parts.month, parts.day);

  const start = Date.parse(`${dashboardStartDate}T00:00:00Z`);
  const startYear = Number(dashboardStartDate.slice(0, 4));
  return [startYear - 1, startYear, startYear + 1]
    .map((year) => isoDate(year, parts.month, parts.day))
    .filter((date): date is string => date !== null)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(`${a}T00:00:00Z`) - start) -
        Math.abs(Date.parse(`${b}T00:00:00Z`) - start),
    )[0] ?? null;
}

export function filterAdPerformanceSourceRowsBeforeDate(
  rows: readonly (readonly unknown[])[],
  dashboardStartDate: string,
  exclusiveEndDate = currentSeoulDate(),
) {
  const normalized = normalizeAdPerformanceSourceRows(rows);
  return [
    ...normalized.slice(0, 2),
    ...normalized.slice(2).filter((row) => {
      const metricDate = resolveAdPerformanceSourceDate(
        row[0],
        dashboardStartDate,
      );
      return metricDate !== null && metricDate < exclusiveEndDate;
    }),
  ];
}

function nonnegativeInteger(value: unknown) {
  const parsed = parseMeaningSheetMetricNumber(value);
  if (parsed === null || parsed <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(parsed));
}

export function adPerformanceSourceLandingDb(
  row: readonly unknown[],
) {
  return {
    googleLandingDb: nonnegativeInteger(row[14]),
    metaLandingDb: nonnegativeInteger(row[15]),
  };
}

export function buildAdPerformanceMetricSnapshot(input: {
  sourceRows: readonly (readonly string[])[];
  dashboardStartDate: string;
  tracking: MeaningTrackingImport | AdPerformanceTrackingImport | null;
  manualInputs: Readonly<Record<string, AdPerformanceSheetManualInput>>;
  exclusiveEndDate?: string;
}) {
  const metrics = new Map<string, AdPerformanceMetricSnapshot>();
  const exclusiveEndDate = input.exclusiveEndDate ?? currentSeoulDate();
  for (const row of input.sourceRows.slice(2)) {
    const metricDate = resolveAdPerformanceSourceDate(
      row[0],
      input.dashboardStartDate,
    );
    if (!metricDate || metricDate >= exclusiveEndDate) continue;

    const trackingKey = meaningSheetDateKey(row[0]);
    const tracked = trackingKey
      ? input.tracking?.dailyByDate[trackingKey]
      : undefined;
    const matchingTracked = tracked?.fullDate === metricDate ? tracked : undefined;
    const manual = input.manualInputs[metricDate];
    const sourceLandingDb = adPerformanceSourceLandingDb(row);
    const landingDb = matchingTracked?.landingDbImported
      ? {
          googleLandingDb: nonnegativeInteger(matchingTracked.googleLandingDb),
          metaLandingDb: nonnegativeInteger(matchingTracked.metaLandingDb),
        }
      : sourceLandingDb;
    const organicLeadsByName = Object.fromEntries(
      (input.tracking?.organicChannels ?? []).map((channel) => [
        channel,
        nonnegativeInteger(matchingTracked?.organicByChannel[channel]),
      ]),
    );

    metrics.set(metricDate, {
      metricDate,
      googleImpressions: nonnegativeInteger(row[2]),
      metaImpressions: nonnegativeInteger(row[3]),
      googleClicks: nonnegativeInteger(row[4]),
      metaClicks: nonnegativeInteger(row[5]),
      googleAdLeads: nonnegativeInteger(row[12]),
      metaAdLeads: nonnegativeInteger(row[13]),
      googleSpend: nonnegativeInteger(row[10]),
      metaSpend: nonnegativeInteger(row[11]),
      googleLandingLeads: landingDb.googleLandingDb,
      metaLandingLeads: landingDb.metaLandingDb,
      adminCumulativeLeads: nonnegativeInteger(manual?.bizupDbCumulative),
      chatRoomMembers: manual?.chatMembersCumulative ?? null,
      organicLeadsByName,
    });
  }
  return [...metrics.values()].sort((a, b) =>
    a.metricDate.localeCompare(b.metricDate),
  );
}

export function isAdPerformanceSheetManualInput(
  value: unknown,
): value is AdPerformanceSheetManualInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdPerformanceSheetManualInput>;
  return [candidate.bizupDbCumulative, candidate.chatMembersCumulative].every(
    (item) =>
      item === null ||
      (typeof item === "number" && Number.isSafeInteger(item) && item >= 0),
  );
}

export function sanitizeSheetManualInputs(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([date, input]) =>
        validIsoDate(date) && isAdPerformanceSheetManualInput(input),
    ),
  ) as Record<string, AdPerformanceSheetManualInput>;
}

export function updateSheetChatMembers(
  manualInputs: Readonly<Record<string, AdPerformanceSheetManualInput>>,
  metricDate: string,
  chatMembersCumulative: number | null,
) {
  const updated = { ...manualInputs };
  const savedInput = updated[metricDate];
  if (savedInput?.bizupDbCumulative == null && chatMembersCumulative === null) {
    delete updated[metricDate];
    return updated;
  }

  updated[metricDate] = {
    bizupDbCumulative: savedInput?.bizupDbCumulative ?? null,
    chatMembersCumulative,
  };
  return updated;
}
