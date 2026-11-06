import { youtubeRsMatchScore, normalizeYoutubeRsMatchValue } from "./youtube-rs";

export type RedlockWorksheet = {
  name: string;
  rows: unknown[][];
};

export type RedlockImportRow = {
  sheetName: string;
  rowNumber: number;
  instructorName: string;
  rsChannelName: string;
  rsFee: number | null;
  cells: string[];
};

export type RedlockChannelCheck = RedlockImportRow & {
  matchedChannelName: string;
  channelStatus: "matched" | "possible" | "missing" | "unmatched";
};

function cellText(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/gu, "")
    .replace(/[^0-9a-z가-힣]/gu, "");
}

function findColumn(header: unknown[], aliases: string[]) {
  for (const alias of aliases) {
    const normalizedAlias = normalized(alias);
    const index = header.findIndex((cell) => normalized(cellText(cell)).includes(normalizedAlias));
    if (index >= 0) return index;
  }
  return -1;
}

function parseFee(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const text = cellText(value).replace(/[^0-9.-]/gu, "");
  if (!text) return null;
  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : null;
}

function headerRowIndex(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const instructor = normalized(cellText(row[2]));
    const channel = normalized(cellText(row[1]));
    return instructor.includes("강사") && channel.includes("채널");
  });
}

export function parseRedlockWorksheet(
  worksheet: RedlockWorksheet,
  instructorName: string,
): RedlockImportRow[] {
  const headerIndex = headerRowIndex(worksheet.rows);
  if (headerIndex < 0) return [];

  const header = worksheet.rows[headerIndex] ?? [];
  const channelIndex = findColumn(header, ["RS 채널명", "RS 채널", "채널명", "유튜브 채널", "채널"]);
  const feeIndex = findColumn(header, ["RS 수수료", "RS수수료", "RS 금액", "RS금액", "RS", "수수료"]);
  const target = normalized(instructorName);
  if (!target) return [];

  const results: RedlockImportRow[] = [];
  let active: RedlockImportRow | null = null;

  const saveActive = (subtotalRow?: unknown[]) => {
    if (!active) return;
    results.push({
      ...active,
      rsFee: subtotalRow && feeIndex >= 0 ? parseFee(subtotalRow[feeIndex]) : active.rsFee,
    });
    active = null;
  };

  for (let offset = 0; offset < worksheet.rows.length - headerIndex - 1; offset += 1) {
    const row = worksheet.rows[headerIndex + offset + 1] ?? [];
    if (normalized(cellText(row[0])) === "소계") {
      saveActive(row);
      continue;
    }

    const rowInstructorName = cellText(row[2]);
    if (!rowInstructorName) continue;
    saveActive();
    if (normalized(rowInstructorName) !== target) continue;
    active = {
      sheetName: worksheet.name,
      rowNumber: headerIndex + offset + 2,
      instructorName: rowInstructorName,
      rsChannelName: channelIndex >= 0 ? cellText(row[channelIndex]) : "",
      rsFee: feeIndex >= 0 ? parseFee(row[feeIndex]) : null,
      cells: row.map(cellText),
    };
  }
  saveActive();
  return results;
}

export function checkRedlockChannels(
  rows: RedlockImportRow[],
  actualChannels: string[],
): RedlockChannelCheck[] {
  return rows.map((row) => {
    if (!row.rsChannelName) {
      return { ...row, matchedChannelName: "", channelStatus: "missing" };
    }
    const exact = actualChannels.find((channel) =>
      normalizeYoutubeRsMatchValue(channel) === normalizeYoutubeRsMatchValue(row.rsChannelName),
    );
    if (exact) return { ...row, matchedChannelName: exact, channelStatus: "matched" };

    const possible = actualChannels
      .map((channel) => ({ channel, score: youtubeRsMatchScore(row.rsChannelName, channel) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.channel;

    return possible
      ? { ...row, matchedChannelName: possible, channelStatus: "possible" }
      : { ...row, matchedChannelName: "", channelStatus: "unmatched" };
  });
}

