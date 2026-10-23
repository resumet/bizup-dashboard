import type { Cell, CellObject, Row } from "write-excel-file/universal";

import { parseMeaningSheetMetricNumber } from "@/lib/admin/meaning-sheet-metrics";
import { adPerformanceTableRow, adPerformanceTableTotals, buildAdPerformanceTableHeaders, type AdPerformanceTableCell } from "./sheet-table";
import { currentSeoulDate } from "./sheet-workspace";
import type { AdPerformanceSheetState } from "./types";

const WON_FORMAT = '#,##0"원"';

function numberCell(value: number | null | undefined, format = "#,##0"): Cell {
  return value == null ? null : { value, type: Number, format };
}

function sourceCell(value: string, column: number): Cell {
  if (column === 0) return { value, type: String };
  const parsed = parseMeaningSheetMetricNumber(value);
  if (parsed === null) return { value, type: String };
  if (column >= 6 && column <= 9) {
    const fraction = value.includes("%") || Math.abs(parsed) > 1 ? parsed / 100 : parsed;
    return numberCell(fraction, "0.00%");
  }
  return numberCell(parsed, [1, 10, 11].includes(column) ? WON_FORMAT : "#,##0");
}

type AdPerformanceExportOptions = {
  cumulativeDbLabel?: string;
};

export function adPerformanceExportRows(
  state: AdPerformanceSheetState,
  startDate: string,
  { cumulativeDbLabel = "누적비즈업 DB" }: AdPerformanceExportOptions = {},
): Row[] {
  const channels = state.tracking?.organicChannels ?? [];
  const headers = buildAdPerformanceTableHeaders(state.sourceRows.slice(0, 2));
  const top: Row = [];
  const bottom: Row = [];
  let bottomIndex = 0;

  function header(value: string, color: string, span = 1, rowSpan = 1): CellObject {
    return { value, type: String, fontWeight: "bold", backgroundColor: color,
      align: "center", alignVertical: "center", wrap: true, columnSpan: span, rowSpan };
  }

  for (const cell of headers.top) {
    top.push(header(cell.label, "#F1F5F9", cell.columnSpan, cell.rowSpan ?? 1));
    for (let offset = 0; offset < cell.columnSpan; offset += 1) {
      if (offset > 0) top.push(null);
      if (cell.rowSpan === 2) {
        bottom.push(null);
      } else {
        const detail = headers.bottom[bottomIndex++];
        bottom.push(cell.key === "column-b"
          ? { ...sourceCell(detail.label, 1) as CellObject, backgroundColor: "#F1F5F9" }
          : header(detail.label, "#F1F5F9"));
      }
    }
  }

  function addHeader(label: string, color: string, children?: string[]) {
    top.push(header(label, color, children?.length ?? 1, children ? 1 : 2));
    if (children) {
      top.push(...children.slice(1).map(() => null));
      bottom.push(...children.map((child) => header(child, color)));
    } else {
      bottom.push(null);
    }
  }

  addHeader("랜딩페이지 접수된DB", "#E0F2FE", ["구글", "메타"]);
  addHeader("랜딩접수총DB (광고)", "#DBEAFE");
  addHeader("자연유입 (오가닉)", "#D1FAE5", [...channels, "오가닉총합"]);
  addHeader("DB총합", "#FEF3C7");
  for (const label of ["랜딩DB당 단가", "광고DB-랜딩DB 단가차이"]) {
    addHeader(label, "#EDE9FE", ["구글광고", "메타광고"]);
  }
  for (const label of [cumulativeDbLabel, "톡방누적 인원", "톡방입장 인원"]) {
    addHeader(label, "#FFEDD5");
  }
  addHeader("랜딩접수 DB단가", "#E0E7FF");
  addHeader("톡방접수 DB단가", "#E0E7FF");

  function exportCells(cells: AdPerformanceTableCell[]): Row {
    return cells.map(({ value, format }) => typeof value === "string"
      ? { value, type: String }
      : numberCell(format === "won" && value !== null ? Math.round(value) : value, format === "won" ? WON_FORMAT : format === "percent" ? "0.00%" : "#,##0"));
  }
  const dataRows = state.sourceRows.slice(2);
  const totals = exportCells(adPerformanceTableTotals(dataRows, startDate, state))
    .map((item) => item ? { ...item, fontWeight: "bold" as const, backgroundColor: "#E0E7FF" } : null);
  return [top, bottom, totals, ...dataRows.map((row) => exportCells(adPerformanceTableRow(row, startDate, state).cells))];
}

export async function buildAdPerformanceXlsx(
  state: AdPerformanceSheetState,
  startDate: string,
  options: AdPerformanceExportOptions = {},
) {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const rows = adPerformanceExportRows(state, startDate, options);
  return writeXlsxFile(rows, {
    sheet: "광고지표", stickyRowsCount: 2, stickyColumnsCount: 1,
    columns: rows[0].map((_, index) => ({ width: index === 0 ? 20 : 18 })),
  }).toBlob();
}

export function adPerformanceExportFileName(sheetName: string) {
  const name = sheetName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 80) || "광고";
  return `${name}_광고지표_${currentSeoulDate()}.xlsx`;
}
