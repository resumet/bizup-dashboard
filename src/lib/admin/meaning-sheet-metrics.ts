export type MeaningSheetManualInput = {
  bizupDbCumulative: number | null;
  chatMembersCumulative: number | null;
};

export type MeaningSheetUnitCostInput = {
  totalAdSpend: number | null;
  googleAdSpend: number | null;
  metaAdSpend: number | null;
  googleAdDb: number | null;
  metaAdDb: number | null;
  googleLandingDb: number | null;
  metaLandingDb: number | null;
  chatEntries: number | null;
};

export type MeaningSheetImportedDailyValues = {
  googleLandingDb: number;
  metaLandingDb: number;
  organicByChannel: Readonly<Record<string, number>>;
};

const integerFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const percentageFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SOURCE_CURRENCY_COLUMN_INDEXES = new Set([1, 10, 11]);
const SOURCE_COUNT_COLUMN_INDEXES = new Set([2, 3, 4, 5]);
const SOURCE_PERCENTAGE_COLUMN_INDEXES = new Set([6, 7, 8, 9]);

function costPerCount(cost: number | null, count: number | null) {
  if (cost === null || count === null || count <= 0) return null;
  return cost / count;
}

function difference(
  adDbUnitCost: number | null,
  landingDbUnitCost: number | null,
) {
  if (adDbUnitCost === null || landingDbUnitCost === null) return null;
  return adDbUnitCost - landingDbUnitCost;
}

function sumWhenPresent(first: number | null, second: number | null) {
  if (first === null && second === null) return null;
  return (first ?? 0) + (second ?? 0);
}

export function parseMeaningSheetMetricNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || /^[-–—]+$/u.test(text.replace(/[₩￦\s]/gu, ""))) return null;

  const normalized = text.replace(/[^\d.-]/gu, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMeaningSheetWon(value: number | null) {
  return value === null
    ? "-"
    : `${integerFormatter.format(Math.round(value))}원`;
}

export function formatMeaningSheetSourceCell(
  value: unknown,
  columnIndex: number,
) {
  const text = String(value ?? "").trim();
  const isCurrency = SOURCE_CURRENCY_COLUMN_INDEXES.has(columnIndex);
  const isCount = SOURCE_COUNT_COLUMN_INDEXES.has(columnIndex);
  const isPercentage = SOURCE_PERCENTAGE_COLUMN_INDEXES.has(columnIndex);

  if (!isCurrency && !isCount && !isPercentage) return text;
  if (!text) return "";

  const parsed = parseMeaningSheetMetricNumber(text);
  if (parsed === null) return "-";

  if (isCurrency) {
    return formatMeaningSheetWon(parsed);
  }

  if (isCount) {
    return `${integerFormatter.format(Math.round(parsed))}건`;
  }

  const percentage = text.includes("%") || Math.abs(parsed) > 1
    ? parsed
    : parsed * 100;
  return `${percentageFormatter.format(percentage)}%`;
}

export function calculateChatRoomEntries(
  today: number | null | undefined,
  yesterday: number | null | undefined,
) {
  if (today === null || today === undefined) return null;
  if (yesterday === null || yesterday === undefined) return null;
  return today - yesterday;
}

export function calculateMeaningSheetImportedTotals(
  daily: MeaningSheetImportedDailyValues,
  organicChannels: readonly string[],
) {
  const landing = daily.googleLandingDb + daily.metaLandingDb;
  const organic = organicChannels.reduce(
    (sum, channel) => sum + (daily.organicByChannel[channel] ?? 0),
    0,
  );

  return {
    landing,
    organic,
    database: landing + organic,
  };
}

export function previousMeaningSheetDateKey(dateKey: string) {
  const matched = /^(\d{2})-(\d{2})$/u.exec(dateKey);
  if (!matched) return null;

  const month = Number(matched[1]);
  const day = Number(matched[2]);
  const date = new Date(Date.UTC(2000, month - 1, day));
  if (
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function calculateMeaningSheetUnitCosts(
  input: MeaningSheetUnitCostInput,
) {
  const googleAdDbUnitCost = costPerCount(
    input.googleAdSpend,
    input.googleAdDb,
  );
  const metaAdDbUnitCost = costPerCount(input.metaAdSpend, input.metaAdDb);
  const googleLandingDbUnitCost = costPerCount(
    input.googleAdSpend,
    input.googleLandingDb,
  );
  const metaLandingDbUnitCost = costPerCount(
    input.metaAdSpend,
    input.metaLandingDb,
  );
  const landingDbTotal = sumWhenPresent(
    input.googleLandingDb,
    input.metaLandingDb,
  );

  return {
    googleAdDbUnitCost,
    metaAdDbUnitCost,
    googleLandingDbUnitCost,
    metaLandingDbUnitCost,
    googleUnitCostDifference: difference(
      googleAdDbUnitCost,
      googleLandingDbUnitCost,
    ),
    metaUnitCostDifference: difference(
      metaAdDbUnitCost,
      metaLandingDbUnitCost,
    ),
    landingReceptionDbUnitCost: costPerCount(
      input.totalAdSpend,
      landingDbTotal,
    ),
    chatReceptionDbUnitCost: costPerCount(
      input.totalAdSpend,
      input.chatEntries,
    ),
  };
}
