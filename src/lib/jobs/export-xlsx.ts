import writeXlsxFile, { type Row } from "write-excel-file/node";

import { formatPhone } from "./filter";
import type { RosterRow } from "./types";

export async function buildRosterXlsx(rows: RosterRow[], defaultCourseName = "", paidRoster = false) {
  const header = [
    "강의명",
    "옵션명",
    "고객명",
    "이메일",
    "연락처",
    ...(paidRoster ? ["결제방법", "RS", "결제ID", "결제금액"] : ["추천인", "유입 경로", "광고 매체"]),
    "비고",
  ].map((value) => ({
    value,
    fontWeight: "bold" as const,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  }));
  const sheetData: Row[] = [
    header,
    ...rows.map(
      (row): Row => [
        row.values.courseName || defaultCourseName,
        row.values.optionName,
        row.values.customerName,
        row.values.email,
        { value: formatPhone(row.normalizedPhone), type: String },
        ...(paidRoster ? [row.values.paymentMethod ?? "", row.values.rs ?? row.values.source, row.values.paymentId ?? "", row.values.paymentAmount ? Number(row.values.paymentAmount) : ""] : [row.values.referrer, row.values.source, row.values.adMedia]),
        row.memo,
      ],
    ),
  ];
  return writeXlsxFile(sheetData, {
    sheet: "수강생명단",
    stickyRowsCount: 1,
    columns: [
      { width: 34 },
      { width: 22 },
      { width: 14 },
      { width: 30 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 24 },
      ...(paidRoster ? [{ width: 24 }] : []),
    ],
  }).toBuffer();
}
