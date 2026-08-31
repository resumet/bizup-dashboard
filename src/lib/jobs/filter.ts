import type { RosterFilters, RosterRow, RosterSort } from "./types";

export function filterRosterRows(rows: RosterRow[], filters: RosterFilters) {
  const keyword = filters.keyword.trim().toLocaleLowerCase("ko-KR");
  return rows.filter((row) => {
    const values = row.values;
    const matchesKeyword =
      !keyword ||
      [
        values.customerName,
        values.email,
        row.normalizedPhone,
        values.referrer,
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(keyword));
    return (
      matchesKeyword &&
      (!filters.courseName || values.courseName === filters.courseName) &&
      (!filters.optionName || values.optionName === filters.optionName) &&
      (!filters.source || values.source === filters.source) &&
      (!filters.adMedia || values.adMedia === filters.adMedia) &&
      (filters.groupChat !== "notJoined" || !row.groupChatJoined)
    );
  });
}

export function uniqueValues(
  rows: RosterRow[],
  field: keyof RosterRow["values"],
) {
  return [
    ...new Set(rows.map((row) => row.values[field]).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ko-KR"));
}

export type RosterSourceAnalysis = {
  source: string;
  count: number;
  percentage: number;
};

export type RosterOptionAnalysis = {
  optionName: string;
  count: number;
  percentage: number;
};

type RosterAnalysisRow = {
  values: Pick<RosterRow["values"], "source" | "optionName">;
};

function analyzeRosterField(
  rows: RosterAnalysisRow[],
  getLabel: (row: RosterAnalysisRow) => string,
) {
  if (rows.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = getLabel(row).trim() || "미분류";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / rows.length) * 1000) / 10,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.label.localeCompare(right.label, "ko-KR"),
    );
}

export function analyzeRosterSources(
  rows: RosterAnalysisRow[],
): RosterSourceAnalysis[] {
  return analyzeRosterField(rows, (row) => row.values.source).map(
    ({ label, ...item }) => ({ source: label, ...item }),
  );
}

export function analyzeRosterOptions(
  rows: RosterAnalysisRow[],
): RosterOptionAnalysis[] {
  return analyzeRosterField(rows, (row) => row.values.optionName).map(
    ({ label, ...item }) => ({ optionName: label, ...item }),
  );
}

export function filterGroupChatNonParticipants(
  rows: RosterRow[],
  onlyNonParticipants: boolean,
) {
  return onlyNonParticipants
    ? rows.filter((row) => !row.groupChatJoined)
    : rows;
}

export function countGroupChatParticipants(
  rows: ReadonlyArray<{ groupChatJoined: boolean }>,
) {
  return rows.reduce(
    (count, row) => count + (row.groupChatJoined ? 1 : 0),
    0,
  );
}

export function sortRosterRows(rows: RosterRow[], sort: RosterSort) {
  return rows.toSorted((left, right) => {
    if (sort === "original") {
      return left.sourceRowNumber - right.sourceRowNumber;
    }

    const leftName = left.values.customerName.trim();
    const rightName = right.values.customerName.trim();
    if (!leftName && !rightName)
      return left.sourceRowNumber - right.sourceRowNumber;
    if (!leftName) return 1;
    if (!rightName) return -1;

    const nameComparison = leftName.localeCompare(rightName, "ko-KR", {
      numeric: true,
      sensitivity: "base",
    });
    if (nameComparison === 0)
      return left.sourceRowNumber - right.sourceRowNumber;
    return sort === "nameAsc" ? nameComparison : -nameComparison;
  });
}

export function formatPhone(phone: string) {
  return phone.replace(/^(010)(\d{4})(\d{4})$/, "$1-$2-$3");
}
