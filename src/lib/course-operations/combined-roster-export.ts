import type { CombinedCourseRosterRow } from "./types";
import { formatPhone } from "@/lib/jobs/filter";

export function combinedRosterExportRecords(rows: readonly CombinedCourseRosterRow[], courseName: string) {
  return [
    ["강의명", "이름", "출처 명단", "연락처", "이메일", "옵션명", "추천인", "유입 경로", "광고 매체", "단톡방", "비고"],
    ...rows.map((row) => [
      row.values.courseName || courseName, row.values.customerName, row.sourceJobName,
      formatPhone(row.normalizedPhone), row.values.email, row.values.optionName,
      row.values.referrer, row.values.source, row.values.adMedia,
      row.groupChatJoined ? "참여" : "미참여", row.memo,
    ]),
  ];
}

export function buildCombinedRosterCsv(rows: readonly CombinedCourseRosterRow[], courseName: string) {
  return "\uFEFF" + combinedRosterExportRecords(rows, courseName).map((record) => record.map((value) => {
    // Keep uploaded text from becoming an Excel formula when opening the CSV.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}

export async function buildCombinedRosterXlsx(rows: readonly CombinedCourseRosterRow[], courseName: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const data = combinedRosterExportRecords(rows, courseName).map((record, index) => record.map((value) => ({
    value, type: String, ...(index === 0 ? { fontWeight: "bold" as const } : {}),
  })));
  return writeXlsxFile(data, {
    sheet: "통합 수강생 명단", stickyRowsCount: 1,
    columns: [32, 16, 28, 20, 30, 22, 18, 18, 18, 12, 36].map((width) => ({ width })),
  }).toBlob();
}

export function combinedRosterExportFileName(courseName: string, count: number, format: "xlsx" | "csv") {
  const name = courseName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 100) || "강의";
  return `${name}-통합명단-필터결과-${count}명.${format}`;
}
