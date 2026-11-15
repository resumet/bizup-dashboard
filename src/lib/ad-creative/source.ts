import "server-only";
import { parse } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import { extractGoogleSpreadsheetId, canonicalGoogleSpreadsheetUrl } from "@/lib/ad-performance/sheet-workspace";
import { parsePublicGoogleSheetNames } from "@/lib/ad-performance/sheet-server";
import { parseCreativeRows } from "./model";

const MAX_BYTES = 20 * 1024 * 1024;
async function download(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (!response.ok || !response.body) throw new Error("Google 시트를 읽을 수 없습니다. 링크가 있는 모든 사용자에게 보기 권한을 허용해 주세요.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("원본 시트는 20MB 이하여야 합니다.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export async function loadCreativeSource(input: string) {
  const id = extractGoogleSpreadsheetId(input);
  const url = canonicalGoogleSpreadsheetUrl(id);
  let sheets: { name: string; rows: unknown[][] }[];
  try {
    const workbook = await readXlsxFile(await download(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`));
    sheets = workbook.map(sheet => ({ name: sheet.sheet, rows: sheet.data }));
  } catch {
    const html = await download(`https://docs.google.com/spreadsheets/d/${id}/edit`);
    const names = parsePublicGoogleSheetNames(html.toString("utf8"));
    if (!["google_raw", "meta_raw"].every(name => names.includes(name))) throw new Error("google_raw와 meta_raw 시트가 모두 있는지, 보기 권한이 공개되어 있는지 확인해 주세요.");
    sheets = await Promise.all(["google_raw", "meta_raw"].map(async name => ({ name,
      rows: parse((await download(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${new URLSearchParams({ tqx: "out:csv", sheet: name })}`)).toString("utf8"), { bom: true, relax_column_count: true, skip_empty_lines: true }) as string[][],
    })));
  }
  const google = sheets.find(sheet => sheet.name === "google_raw");
  const meta = sheets.find(sheet => sheet.name === "meta_raw");
  if (!google || !meta) throw new Error("google_raw와 meta_raw 시트가 모두 필요합니다.");
  const rows = [...parseCreativeRows("google", google.rows), ...parseCreativeRows("meta", meta.rows)];
  if (rows.length > 100_000) throw new Error("한 번에 최대 100,000행까지 불러올 수 있습니다. 시트의 조회 기간을 줄여 주세요.");
  return { url, rows };
}
