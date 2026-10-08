export const MEANING_TRACKING_SHEET_NAME = "일자별 묶음";
const INSTAGRAM_ORGANIC_CHANNEL = "인스타";
const UNKNOWN_ORGANIC_CHANNEL = "경로불명";

export type MeaningTrackingDailyValues = {
  fullDate: string;
  googleLandingDb: number;
  metaLandingDb: number;
  landingDbImported?: boolean;
  organicByChannel: Record<string, number>;
};

export type MeaningTrackingImport = {
  dailyByDate: Record<string, MeaningTrackingDailyValues>;
  organicChannels: string[];
  matchedRowCount: number;
  bizupDbCumulativeDate?: string;
  bizupDbCumulativeCount?: number;
};

function cellText(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value ?? "").trim();
}

function normalizedText(value: unknown) {
  return cellText(value).replace(/\s/gu, "").toLocaleLowerCase("ko-KR");
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(cellText(value).replace(/[^\d.-]/gu, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateParts(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  const text = cellText(value);
  const fullDate = text.match(
    /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/u,
  );
  if (fullDate) {
    return {
      year: Number(fullDate[1]),
      month: Number(fullDate[2]),
      day: Number(fullDate[3]),
    };
  }

  const shortDate = text.match(
    /(?:^|\D)(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?:\D|$)/u,
  );
  if (shortDate) {
    return {
      year: 2000 + Number(shortDate[1]),
      month: Number(shortDate[2]),
      day: Number(shortDate[3]),
    };
  }

  const monthDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/u);
  if (monthDay) {
    return {
      year: null,
      month: Number(monthDay[1]),
      day: Number(monthDay[2]),
    };
  }

  return null;
}

function validDateParts(parts: ReturnType<typeof dateParts>) {
  return Boolean(
    parts &&
      parts.month >= 1 &&
      parts.month <= 12 &&
      parts.day >= 1 &&
      parts.day <= 31,
  );
}

function monthDayKey(month: number, day: number) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function meaningSheetDateKey(value: unknown) {
  const parts = dateParts(value);
  if (!validDateParts(parts) || !parts) return null;
  return monthDayKey(parts.month, parts.day);
}

function trackingDate(value: unknown) {
  const parts = dateParts(value);
  if (!validDateParts(parts) || !parts || parts.year === null) return null;
  const key = monthDayKey(parts.month, parts.day);
  return {
    key,
    fullDate: `${parts.year}-${key}`,
  };
}

function currentSeoulDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(value)
    .filter((part) => part.type !== "literal");
  const today = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${today.year}-${today.month}-${today.day}`;
}

function previousIsoDate(value: string) {
  const previous = new Date(`${value}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function headerColumns(row: readonly unknown[]) {
  const normalized = row.map(normalizedText);
  const media = normalized.findIndex((value) => value === "진행매체");
  const total = normalized.findIndex((value) => value === "총인원");
  if (media < 0 || total < 0) return null;

  const channel = normalized.findIndex((value) => value === "코드");
  return {
    channel: channel >= 0 ? channel : 1,
    media,
    total,
  };
}

function emptyDailyValues(fullDate: string): MeaningTrackingDailyValues {
  return {
    fullDate,
    googleLandingDb: 0,
    metaLandingDb: 0,
    organicByChannel: {},
  };
}

function applyListHeaderColumns(row: readonly unknown[]) {
  const normalized = row.map(normalizedText);
  const date = normalized.findIndex((value) => value === "신청일");
  const channel = normalized.findIndex((value) => value === "유입경로");
  const media = normalized.findIndex((value) => value === "진행매체");
  if (date < 0 || channel < 0 || media < 0) return null;
  return { date, channel, media };
}

export function parseMeaningTrackingApplyList(
  rows: readonly (readonly unknown[])[],
  todayDate = currentSeoulDate(),
): MeaningTrackingImport {
  const paidLandingDate = previousIsoDate(todayDate);
  const dailyByDate: Record<string, MeaningTrackingDailyValues> = {};
  const youtubeChannels: string[] = [];
  const knownYoutubeChannels = new Set<string>();
  let columns: ReturnType<typeof applyListHeaderColumns> = null;
  let matchedRowCount = 0;
  let bizupDbCumulativeCount = 0;

  for (const row of rows) {
    const detectedColumns = applyListHeaderColumns(row);
    if (detectedColumns) {
      columns = detectedColumns;
      continue;
    }
    if (!columns) continue;

    const date = trackingDate(row[columns.date]);
    if (!date) continue;
    if (date.fullDate < todayDate) bizupDbCumulativeCount += 1;

    const media = normalizedText(row[columns.media]);
    const normalizedChannel = normalizedText(row[columns.channel]);
    let daily = dailyByDate[date.key];
    if (date.fullDate === paidLandingDate) {
      daily ??= dailyByDate[date.key] = emptyDailyValues(date.fullDate);
      daily.landingDbImported = true;
      if (normalizedChannel === "그로스임팩트" && media === "메타") {
        daily.metaLandingDb += 1;
        matchedRowCount += 1;
        continue;
      }
      if (normalizedChannel === "그로스임팩트" && media === "구글") {
        daily.googleLandingDb += 1;
        matchedRowCount += 1;
        continue;
      }
    }

    let channel: string;
    if (media === "유튜브") {
      channel = cellText(row[columns.channel]);
      if (!channel || channel === "-") continue;
      if (!knownYoutubeChannels.has(channel)) {
        knownYoutubeChannels.add(channel);
        youtubeChannels.push(channel);
      }
    } else if (media === "인스타그램") {
      channel = INSTAGRAM_ORGANIC_CHANNEL;
    } else if (!media) {
      channel = UNKNOWN_ORGANIC_CHANNEL;
    } else {
      continue;
    }

    daily ??= dailyByDate[date.key] = emptyDailyValues(date.fullDate);
    daily.organicByChannel[channel] =
      (daily.organicByChannel[channel] ?? 0) + 1;
    matchedRowCount += 1;
  }

  return {
    dailyByDate,
    organicChannels: [
      ...youtubeChannels,
      INSTAGRAM_ORGANIC_CHANNEL,
      UNKNOWN_ORGANIC_CHANNEL,
    ],
    matchedRowCount,
    bizupDbCumulativeDate: paidLandingDate,
    bizupDbCumulativeCount,
  };
}

export function parseMeaningTrackingSheet(
  rows: readonly (readonly unknown[])[],
): MeaningTrackingImport {
  const dailyByDate: Record<string, MeaningTrackingDailyValues> = {};
  const organicChannels: string[] = [];
  const knownOrganicChannels = new Set<string>();
  let currentDate: ReturnType<typeof trackingDate> = null;
  let columns = { channel: 1, media: 2, total: 5 };
  let matchedRowCount = 0;

  for (const row of rows) {
    const rowDate = trackingDate(row[0]);
    if (rowDate) {
      currentDate = rowDate;
      continue;
    }

    const detectedColumns = headerColumns(row);
    if (detectedColumns) {
      columns = detectedColumns;
      continue;
    }

    if (!currentDate) continue;
    const media = normalizedText(row[columns.media]);
    if (!media) continue;

    const total = numericValue(row[columns.total]);

    if (media === "메타") {
      const daily = (dailyByDate[currentDate.key] ??= emptyDailyValues(
        currentDate.fullDate,
      ));
      daily.landingDbImported = true;
      daily.metaLandingDb += total;
      matchedRowCount += 1;
      continue;
    }

    if (media === "구글") {
      const daily = (dailyByDate[currentDate.key] ??= emptyDailyValues(
        currentDate.fullDate,
      ));
      daily.landingDbImported = true;
      daily.googleLandingDb += total;
      matchedRowCount += 1;
      continue;
    }

    if (media !== "유튜브" && media !== "인스타그램") continue;
    const channel =
      media === "인스타그램"
        ? INSTAGRAM_ORGANIC_CHANNEL
        : cellText(row[columns.channel]);
    if (!channel || channel === "-") continue;

    if (!knownOrganicChannels.has(channel)) {
      knownOrganicChannels.add(channel);
      organicChannels.push(channel);
    }
    const daily = (dailyByDate[currentDate.key] ??= emptyDailyValues(
      currentDate.fullDate,
    ));
    daily.organicByChannel[channel] =
      (daily.organicByChannel[channel] ?? 0) + total;
    matchedRowCount += 1;
  }

  return {
    dailyByDate,
    organicChannels,
    matchedRowCount,
  };
}
