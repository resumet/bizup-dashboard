import writeXlsxFile, { type Row } from "write-excel-file/node";

import type { RosterRow } from "./types";

export async function buildRosterXlsx(rows: RosterRow[], defaultCourseName = "") {
  const header = ["강의명", "옵션명", "고객명", "이메일", "연락처", "추천인", "유입 경로", "광고 매체"].map((value) => ({ value, fontWeight: "bold" as const, color: "#ffffff", backgroundColor: "#111827" }));
  const sheetData: Row[] = [header, ...rows.map((row): Row => [row.values.courseName || defaultCourseName, row.values.optionName, row.values.customerName, row.values.email, { value: row.normalizedPhone, type: String }, row.values.referrer, row.values.source, row.values.adMedia])];
  return writeXlsxFile(sheetData, { sheet: "수강생명단", stickyRowsCount: 1, columns: [{ width: 34 }, { width: 22 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }] }).toBuffer();
}

