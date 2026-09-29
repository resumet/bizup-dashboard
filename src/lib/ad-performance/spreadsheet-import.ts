import type {
  AdPerformanceDailyMetric,
  AdPerformanceOrganicChannel,
} from "./types";

type ImportedPaidField =
  | "googleImpressions"
  | "metaImpressions"
  | "googleClicks"
  | "metaClicks"
  | "googleSpend"
  | "metaSpend"
  | "googleAdLeads"
  | "metaAdLeads"
  | "googleLandingLeads"
  | "metaLandingLeads"
  | "adminCumulativeLeads";

type SpreadsheetImportResult =
  | {
      ok: true;
      metric: AdPerformanceDailyMetric;
      importedOrganicChannelNames: string[];
    }
  | { ok: false; message: string };

const paidColumnMap: readonly (readonly [ImportedPaidField, number])[] = [
  ["googleImpressions", 2],
  ["metaImpressions", 3],
  ["googleClicks", 4],
  ["metaClicks", 5],
  ["googleSpend", 10],
  ["metaSpend", 11],
  ["googleAdLeads", 12],
  ["metaAdLeads", 13],
  ["googleLandingLeads", 14],
  ["metaLandingLeads", 15],
  ["adminCumulativeLeads", 23],
];

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/gu, "").toLocaleLowerCase("ko-KR");
}

function splitRow(line: string) {
  const trimmed = line.trim();
  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  }

  return line.split("\t").map((cell) => cell.trim());
}

function parseRows(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map(splitRow)
    .filter((row) => row.some(Boolean));
}

function isValidDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeDate(value: string, targetDate: string) {
  const compact = value.trim().replace(/\s+/gu, "");
  const fullDate = compact.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/u);
  const monthDay = compact.match(/^(\d{1,2})(?:월|[./-])(\d{1,2})일?$/u);
  const parts = fullDate
    ? [fullDate[1], fullDate[2], fullDate[3]]
    : monthDay
      ? [targetDate.slice(0, 4), monthDay[1], monthDay[2]]
      : null;
  if (!parts) return "";

  const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  return isValidDate(normalized) ? normalized : "";
}

function parseNumber(value: string | undefined) {
  const digits = value?.replace(/\D/gu, "") ?? "";
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function findOrganicColumnIndexes(
  rows: string[][],
  dataRowIndex: number,
  channels: AdPerformanceOrganicChannel[],
) {
  const columnIndexes = new Map<string, number>();
  const channelsByName = new Map(
    channels.map((channel) => [normalizeLabel(channel.name), channel]),
  );

  rows.slice(0, dataRowIndex).forEach((row) => {
    row.forEach((cell, columnIndex) => {
      if (columnIndex < 17) return;
      const channel = channelsByName.get(normalizeLabel(cell));
      if (channel && !columnIndexes.has(channel.id)) {
        columnIndexes.set(channel.id, columnIndex);
      }
    });
  });

  return columnIndexes;
}

export function importAdPerformanceSpreadsheet(
  spreadsheet: string,
  metric: AdPerformanceDailyMetric,
  channels: AdPerformanceOrganicChannel[],
): SpreadsheetImportResult {
  if (!spreadsheet.trim()) {
    return { ok: false, message: "엑셀 표를 붙여넣어 주세요." };
  }
  if (!isValidDate(metric.metricDate)) {
    return { ok: false, message: "먼저 날짜를 올바르게 선택해 주세요." };
  }

  const rows = parseRows(spreadsheet);
  const dataRowIndex = rows.findIndex(
    (row) => normalizeDate(row[0] ?? "", metric.metricDate) === metric.metricDate,
  );
  if (dataRowIndex < 0) {
    return {
      ok: false,
      message: `붙여넣은 표에서 ${metric.metricDate} 날짜 행을 찾지 못했습니다.`,
    };
  }

  const dataRow = rows[dataRowIndex];
  if (dataRow.length < 16) {
    return { ok: false, message: "광고 원시데이터 표의 열을 확인해 주세요." };
  }

  const nextMetric: AdPerformanceDailyMetric = {
    ...metric,
    organicLeads: { ...metric.organicLeads },
  };
  paidColumnMap.forEach(([field, columnIndex]) => {
    nextMetric[field] = parseNumber(dataRow[columnIndex]);
  });

  const organicColumnIndexes = findOrganicColumnIndexes(rows, dataRowIndex, channels);
  const importedOrganicChannelNames: string[] = [];
  channels.forEach((channel) => {
    const columnIndex = organicColumnIndexes.get(channel.id);
    if (columnIndex === undefined) return;
    nextMetric.organicLeads[channel.id] = parseNumber(dataRow[columnIndex]);
    importedOrganicChannelNames.push(channel.name);
  });

  return { ok: true, metric: nextMetric, importedOrganicChannelNames };
}
