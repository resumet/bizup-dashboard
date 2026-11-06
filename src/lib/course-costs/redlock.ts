import { youtubeRsMatchScore, normalizeYoutubeRsMatchValue } from "./youtube-rs";

export type RedlockWorksheet = {
  name: string;
  rows: unknown[][];
};

export type RedlockPayer = {
  rowNumber: number;
  name: string;
  email: string;
};

export type RedlockActualPayer = {
  name: string;
  email: string;
};

export type RedlockImportRow = {
  sheetName: string;
  rowNumber: number;
  instructorName: string;
  rsChannelName: string;
  rsFee: number | null;
  cells: string[];
  payers: RedlockPayer[];
};

export type RedlockChannelCheck = RedlockImportRow & {
  matchedChannelName: string;
  channelStatus: "matched" | "possible" | "missing" | "unmatched";
};

export type RedlockPayerReconciliation = {
  row: RedlockImportRow;
  matchedCount: number;
  missingPayers: RedlockPayer[];
  missingEmailPayers: RedlockPayer[];
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

function normalizedEmail(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, "");
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
  const payerNameIndex = findColumn(header, ["이름", "성명", "결제자명"]);
  const payerEmailIndex = findColumn(header, ["이메일", "메일", "email"]);
  const target = normalized(instructorName);
  if (!target) return [];

  const results: RedlockImportRow[] = [];
  let active: RedlockImportRow | null = null;
  let activeChannelName = "";

  const saveActive = (subtotalRow?: unknown[]) => {
    if (!active) return;
    results.push({
      ...active,
      rsFee: subtotalRow && feeIndex >= 0 ? parseFee(subtotalRow[feeIndex]) : active.rsFee,
    });
    active = null;
  };

  const addPayer = (row: unknown[], rowNumber: number) => {
    if (!active) return;
    const name = payerNameIndex >= 0 ? cellText(row[payerNameIndex]) : "";
    const email = payerEmailIndex >= 0 ? cellText(row[payerEmailIndex]) : "";
    if (name || email) active.payers.push({ rowNumber, name, email });
  };

  for (let offset = 0; offset < worksheet.rows.length - headerIndex - 1; offset += 1) {
    const row = worksheet.rows[headerIndex + offset + 1] ?? [];
    const rowNumber = headerIndex + offset + 2;
    if (normalized(cellText(row[0])) === "소계") {
      saveActive(row);
      activeChannelName = "";
      continue;
    }

    const rowChannelName = channelIndex >= 0 ? cellText(row[channelIndex]) : "";
    if (rowChannelName) activeChannelName = rowChannelName;
    const rowInstructorName = cellText(row[2]);
    if (rowInstructorName) {
      saveActive();
      if (normalized(rowInstructorName) !== target) continue;
      active = {
        sheetName: worksheet.name,
        rowNumber,
        instructorName: rowInstructorName,
        rsChannelName: rowChannelName || activeChannelName,
        rsFee: feeIndex >= 0 ? parseFee(row[feeIndex]) : null,
        cells: row.map(cellText),
        payers: [],
      };
    }
    addPayer(row, rowNumber);
  }
  saveActive();
  return results;
}

export function reconcileRedlockPayers(
  rows: RedlockImportRow[],
  actualPayers: RedlockActualPayer[],
): RedlockPayerReconciliation[] {
  const actualEmails = new Set(
    actualPayers
      .map((payer) => normalizedEmail(payer.email))
      .filter(Boolean),
  );

  return rows.map((row) => {
    const missingEmailPayers = row.payers.filter((payer) => !normalizedEmail(payer.email));
    const missingPayers = row.payers.filter((payer) => {
      const email = normalizedEmail(payer.email);
      return Boolean(email) && !actualEmails.has(email);
    });
    return {
      row,
      matchedCount: row.payers.length - missingPayers.length - missingEmailPayers.length,
      missingPayers,
      missingEmailPayers,
    };
  });
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

