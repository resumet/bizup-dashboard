import { parse } from "csv-parse/sync";

import { MEANING_SHEET_COLUMN_COUNT } from "./meaning-sheet-headers";
export { MEANING_SHEET_COLUMN_COUNT, buildMeaningSheetHeaders } from "./meaning-sheet-headers";
export type { MeaningSheetHeaderCell, MeaningSheetHeaders } from "./meaning-sheet-headers";

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
