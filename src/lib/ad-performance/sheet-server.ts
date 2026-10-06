import "server-only";

import { randomUUID } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";

import {
  MEANING_TRACKING_SHEET_NAME,
  parseMeaningTrackingApplyList,
  parseMeaningTrackingSheet,
} from "@/lib/admin/meaning-tracking";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdPerformanceSheetState,
  AdPerformanceTrackingImport,
} from "./types";
import {
  AD_PERFORMANCE_MAX_TRACKING_BYTES,
  AD_PERFORMANCE_MAX_WORKBOOK_BYTES,
  buildAdPerformanceMetricSnapshot,
  canonicalGoogleSpreadsheetUrl,
  extractGoogleSpreadsheetId,
  filterAdPerformanceSourceRowsBeforeDate,
  normalizeAdPerformanceSourceRows,
  sanitizeSheetManualInputs,
} from "./sheet-workspace";

type SheetStateRow = {
  spreadsheet_url: string;
  spreadsheet_id: string;
  sheet_name: string;
  source_rows: unknown;
  tracking_file_name: string | null;
  tracking_data: unknown;
  manual_inputs: unknown;
  version: number;
  updated_at: string;
};

export const AD_PERFORMANCE_TRACKING_BUCKET =
  "ad-performance-tracking-files";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

type TrackingFileFormat = "csv" | "xlsx";

export type AdPerformanceDashboardContext = {
  dashboardId: string;
  workspaceId: string;
  startDate: string;
};

export type GoogleWorkbookSheet = {
  name: string;
  rows: string[][];
};

function trackingImport(value: unknown): AdPerformanceTrackingImport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AdPerformanceTrackingImport>;
  if (
    !candidate.dailyByDate ||
    typeof candidate.dailyByDate !== "object" ||
    !Array.isArray(candidate.organicChannels) ||
    typeof candidate.matchedRowCount !== "number"
  ) {
    return null;
  }
  return {
    ...(candidate as AdPerformanceTrackingImport),
    sourceStoragePath:
      typeof candidate.sourceStoragePath === "string"
        ? candidate.sourceStoragePath
        : undefined,
  };
}

function trackingStoragePrefix(context: AdPerformanceDashboardContext) {
  return `${context.workspaceId}/${context.dashboardId}/`;
}

function trackingFileFormat(fileName: string): TrackingFileFormat | null {
  const lowerName = fileName.toLocaleLowerCase("ko-KR");
  if (lowerName.endsWith(".csv")) return "csv";
  if (lowerName.endsWith(".xlsx")) return "xlsx";
  return null;
}

export function isAdPerformanceTrackingStoragePath(
  context: AdPerformanceDashboardContext,
  value: string,
) {
  return value.startsWith(trackingStoragePrefix(context));
}

export async function storeAdPerformanceTrackingFile(
  context: AdPerformanceDashboardContext,
  file: File,
) {
  const format = trackingFileFormat(file.name);
  if (!format) throw new Error(".xlsx 또는 .csv 파일만 추가할 수 있습니다.");
  const path = `${trackingStoragePrefix(context)}${randomUUID()}.${format}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(AD_PERFORMANCE_TRACKING_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: format === "csv" ? CSV_CONTENT_TYPE : XLSX_CONTENT_TYPE,
      upsert: false,
    });
  if (error) throw new Error(`유입 엑셀 원본 저장 실패: ${error.message}`);
  return path;
}

export async function removeAdPerformanceTrackingFile(path: string | null) {
  if (!path) return;
  const admin = createAdminClient();
  await admin.storage.from(AD_PERFORMANCE_TRACKING_BUCKET).remove([path]);
}

export async function downloadAdPerformanceTrackingFile(
  context: AdPerformanceDashboardContext,
  path: string,
) {
  if (!isAdPerformanceTrackingStoragePath(context, path)) {
    throw new Error("저장된 유입 엑셀 경로가 올바르지 않습니다.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(AD_PERFORMANCE_TRACKING_BUCKET)
    .download(path);
  if (error || !data) throw new Error("저장된 유입 엑셀 원본을 찾을 수 없습니다.");
  return data;
}

export function toAdPerformanceSheetState(
  row: SheetStateRow,
): AdPerformanceSheetState {
  return {
    spreadsheetUrl: row.spreadsheet_url,
    spreadsheetId: row.spreadsheet_id,
    sheetName: row.sheet_name,
    sourceRows: normalizeAdPerformanceSourceRows(
      Array.isArray(row.source_rows) ? row.source_rows : [],
    ),
    trackingFileName: row.tracking_file_name,
    tracking: trackingImport(row.tracking_data),
    manualInputs: sanitizeSheetManualInputs(row.manual_inputs),
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
}

export async function authorizeAdPerformanceDashboard(
  dashboardId: string,
  workspaceId: string,
): Promise<AdPerformanceDashboardContext> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_performance_dashboards")
    .select("id,workspace_id,start_date")
    .eq("workspace_id", workspaceId)
    .eq("id", dashboardId)
    .maybeSingle();
  if (error) throw new Error(`광고성과 조회 실패: ${error.code}`);
  if (!data) throw new Error("NOT_FOUND");
  return {
    dashboardId: data.id as string,
    workspaceId: data.workspace_id as string,
    startDate: data.start_date as string,
  };
}

export async function loadAdPerformanceSheetState(
  dashboardId: string,
  dashboardStartDate?: string,
): Promise<AdPerformanceSheetState | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_performance_sheet_states")
    .select(
      "spreadsheet_url,spreadsheet_id,sheet_name,source_rows,tracking_file_name,tracking_data,manual_inputs,version,updated_at",
    )
    .eq("dashboard_id", dashboardId)
    .maybeSingle();
  if (error) {
    if (/PGRST20[45]|42P01/u.test(error.code ?? "")) return null;
    throw new Error(`원본 시트 연결 조회 실패: ${error.code}`);
  }
  if (!data) return null;
  const state = toAdPerformanceSheetState(data as SheetStateRow);
  return dashboardStartDate
    ? {
        ...state,
        sourceRows: filterAdPerformanceSourceRowsBeforeDate(
          state.sourceRows,
          dashboardStartDate,
        ),
      }
    : state;
}

export async function loadAdPerformanceSheetSyncState(dashboardId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_performance_sheet_states")
    .select("version,updated_at,tracking_file_name")
    .eq("dashboard_id", dashboardId)
    .maybeSingle();
  if (error) {
    if (/PGRST20[45]|42P01/u.test(error.code ?? "")) return null;
    throw new Error(`원본 시트 동기화 상태 조회 실패: ${error.code}`);
  }
  if (!data) return null;
  return {
    version: Number(data.version),
    updatedAt: data.updated_at as string,
    trackingFileName: data.tracking_file_name as string | null,
  };
}

async function responseBuffer(response: Response, maximumBytes: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maximumBytes) {
    throw new Error("원본 파일 용량이 너무 큽니다.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maximumBytes) {
    throw new Error("원본 파일 용량이 너무 큽니다.");
  }
  return buffer;
}

export async function loadGoogleWorkbook(
  spreadsheetUrl: string,
  dashboardStartDate: string,
): Promise<{ spreadsheetId: string; canonicalUrl: string; sheets: GoogleWorkbookSheet[] }> {
  const spreadsheetId = extractGoogleSpreadsheetId(spreadsheetUrl);
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  let response: Response;
  try {
    response = await fetch(exportUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Google Sheets에 연결하지 못했습니다.");
  }
  if (!response.ok) {
    throw new Error(
      "Google Sheets를 읽을 수 없습니다. 링크가 있는 모든 사용자가 볼 수 있도록 공개했는지 확인해 주세요.",
    );
  }
  const workbook = await readXlsxFile(
    await responseBuffer(response, AD_PERFORMANCE_MAX_WORKBOOK_BYTES),
  );
  const sheets = workbook.map((sheet) => ({
    name: sheet.sheet.trim(),
    rows: filterAdPerformanceSourceRowsBeforeDate(
      sheet.data,
      dashboardStartDate,
    ),
  }));
  if (!sheets.length || !sheets[0]?.name) {
    throw new Error("선택할 수 있는 시트가 없습니다.");
  }
  return {
    spreadsheetId,
    canonicalUrl: canonicalGoogleSpreadsheetUrl(spreadsheetId),
    sheets,
  };
}

export async function parseAdPerformanceTrackingFile(file: File) {
  const format = trackingFileFormat(file.name);
  if (!format) throw new Error(".xlsx 또는 .csv 파일만 추가할 수 있습니다.");
  if (file.size <= 0 || file.size > AD_PERFORMANCE_MAX_TRACKING_BYTES) {
    throw new Error("15MB 이하의 엑셀 또는 CSV 파일을 선택해 주세요.");
  }
  return parseAdPerformanceTrackingBuffer(
    Buffer.from(await file.arrayBuffer()),
    format,
  );
}

function parseTrackingRows(rows: readonly (readonly unknown[])[]) {
  const applyList = parseMeaningTrackingApplyList(rows);
  if (Object.keys(applyList.dailyByDate).length && applyList.matchedRowCount) {
    return applyList;
  }

  const legacy = parseMeaningTrackingSheet(rows);
  return Object.keys(legacy.dailyByDate).length && legacy.matchedRowCount
    ? legacy
    : null;
}

async function parseAdPerformanceTrackingBuffer(
  buffer: Buffer,
  format: TrackingFileFormat,
) {
  if (format === "csv") {
    const rows = parseCsv(buffer.toString("utf8"), {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
    const parsed = parseTrackingRows(rows);
    if (parsed) return parsed;
  } else {
    const workbook = await readXlsxFile(buffer);
    const orderedSheets = [
      ...workbook.filter((sheet) => sheet.sheet === MEANING_TRACKING_SHEET_NAME),
      ...workbook.filter((sheet) => sheet.sheet !== MEANING_TRACKING_SHEET_NAME),
    ];
    for (const sheet of orderedSheets) {
      const parsed = parseTrackingRows(sheet.data);
      if (parsed) return parsed;
    }
  }

  throw new Error(
    "신청일·유입경로·진행매체 열에서 유튜브·인스타그램·경로불명 유입 값을 찾지 못했습니다.",
  );
}

export async function refreshAdPerformanceTrackingImport(
  context: AdPerformanceDashboardContext,
  path: string,
) {
  const file = await downloadAdPerformanceTrackingFile(context, path);
  if (file.size <= 0 || file.size > AD_PERFORMANCE_MAX_TRACKING_BYTES) {
    throw new Error("저장된 유입 엑셀 원본의 크기를 확인해 주세요.");
  }
  return {
    ...(await parseAdPerformanceTrackingBuffer(
      Buffer.from(await file.arrayBuffer()),
      trackingFileFormat(path) ?? "xlsx",
    )),
    sourceStoragePath: path,
  };
}

export async function persistAdPerformanceSheetState(input: {
  context: AdPerformanceDashboardContext;
  actorId: string;
  state: Omit<AdPerformanceSheetState, "version" | "updatedAt">;
  expectedVersion: number;
}) {
  const metricSnapshot = buildAdPerformanceMetricSnapshot({
    sourceRows: input.state.sourceRows,
    dashboardStartDate: input.context.startDate,
    tracking: input.state.tracking,
    manualInputs: input.state.manualInputs,
  });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("save_ad_performance_sheet_state", {
    p_dashboard_id: input.context.dashboardId,
    p_actor_id: input.actorId,
    p_expected_version: input.expectedVersion,
    p_spreadsheet_url: input.state.spreadsheetUrl,
    p_spreadsheet_id: input.state.spreadsheetId,
    p_sheet_name: input.state.sheetName,
    p_source_rows: input.state.sourceRows,
    p_tracking_file_name: input.state.trackingFileName,
    p_tracking_data: input.state.tracking,
    p_manual_inputs: input.state.manualInputs,
    p_metric_snapshot: metricSnapshot,
  });
  if (error) throw new Error(`시트 데이터 저장 실패: ${error.message}`);
  return { version: Number(data), metricCount: metricSnapshot.length };
}
