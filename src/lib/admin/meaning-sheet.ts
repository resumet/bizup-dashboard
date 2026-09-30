import { parse } from "csv-parse/sync";

export const MEANING_SHEET_COLUMN_COUNT = 14;

export type MeaningSheetHeaderCell = {
  key: string;
  label: string;
  columnSpan: number;
  rowSpan?: number;
};

export type MeaningSheetHeaders = {
  top: MeaningSheetHeaderCell[];
  bottom: MeaningSheetHeaderCell[];
};

export type MeaningSheetData = {
  rows: string[][];
  rowCount: number;
  columnCount: number;
};

export function parseMeaningSheetCsv(csv: string): MeaningSheetData {
  const parsed = parse(csv, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as unknown[][];
  const rows = parsed.map((row) =>
    row
      .slice(0, MEANING_SHEET_COLUMN_COUNT)
      .map((cell) =>
        cell === null || cell === undefined ? "" : String(cell),
      ),
  );

  while (
    rows.length &&
    rows.at(-1)?.every((cell) => cell.trim().length === 0)
  ) {
    rows.pop();
  }

  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from(
      { length: MEANING_SHEET_COLUMN_COUNT - row.length },
      () => "",
    ),
  ]);

  return {
    rows: normalizedRows,
    rowCount: normalizedRows.length,
    columnCount: MEANING_SHEET_COLUMN_COUNT,
  };
}

function headerValue(row: readonly string[], columnIndex: number) {
  return row[columnIndex]?.trim() ?? "";
}

export function buildMeaningSheetHeaders(
  rows: readonly (readonly string[])[],
): MeaningSheetHeaders {
  const firstRow = rows[0] ?? [];
  const secondRow = rows[1] ?? [];
  const top: MeaningSheetHeaderCell[] = [
    {
      key: "column-a",
      label: headerValue(firstRow, 0) || "미닝웨비나",
      columnSpan: 1,
      rowSpan: 2,
    },
    {
      key: "column-b",
      label: headerValue(firstRow, 1) || "총광고비",
      columnSpan: 1,
    },
  ];
  const bottom: MeaningSheetHeaderCell[] = [
    {
      key: "column-b-detail",
      label: headerValue(secondRow, 1) || "-",
      columnSpan: 1,
    },
  ];

  for (
    let columnIndex = 2;
    columnIndex < MEANING_SHEET_COLUMN_COUNT;
    columnIndex += 2
  ) {
    top.push({
      key: `columns-${columnIndex}-${columnIndex + 1}`,
      label:
        headerValue(firstRow, columnIndex) ||
        headerValue(firstRow, columnIndex + 1) ||
        "-",
      columnSpan: 2,
    });
    bottom.push(
      {
        key: `column-${columnIndex}`,
        label: headerValue(secondRow, columnIndex) || "구글광고",
        columnSpan: 1,
      },
      {
        key: `column-${columnIndex + 1}`,
        label: headerValue(secondRow, columnIndex + 1) || "메타광고",
        columnSpan: 1,
      },
    );
  }

  return { top, bottom };
}
