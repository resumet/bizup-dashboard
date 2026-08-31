import type { RosterRow } from "./types";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function formatPhone(phone: string) {
  return phone.replace(/^(010)(\d{4})(\d{4})$/u, "$1-$2-$3");
}

export function buildTargetContactCsv(
  rows: ReadonlyArray<{
    normalizedPhone: RosterRow["normalizedPhone"];
    values: Pick<RosterRow["values"], "customerName">;
  }>,
) {
  const records = [
    ["이름", "전화번호"],
    ...rows.map((row) => [
      row.values.customerName.trim(),
      formatPhone(row.normalizedPhone),
    ]),
  ];

  return `\uFEFF${records
    .map((record) => record.map(csvCell).join(","))
    .join("\r\n")}`;
}

export function targetContactCsvFileName(name: string) {
  const safeName = name.trim().replace(/[\\/:*?"<>|]/gu, "_") || "수강생명단";
  return `${safeName}-단톡방-미참여자.csv`;
}
