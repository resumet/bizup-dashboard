import "server-only";

import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

import { isSuperAdminEmail } from "@/lib/admin/access";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_TRIP_REPORT_BUCKET, validateBusinessTripFile } from "./file";
import { canManageBusinessTripReport } from "./model";
import type { BusinessTripDashboardSummary, BusinessTripReport } from "./types";

type ReportRow = {
  id: string;
  workspace_id: string;
  author_id: string | null;
  author_name: string;
  title: string;
  final_cost: number | string;
  payment_completed: boolean;
  payment_completed_at: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | string | null;
  file_mime_type: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

const REPORT_COLUMNS = "id,workspace_id,author_id,author_name,title,final_cost,payment_completed,payment_completed_at,file_path,file_name,file_size,file_mime_type,version,created_at,updated_at";

export class BusinessTripReportError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function businessTripReportResponseError(error: unknown) {
  if (error instanceof BusinessTripReportError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }
  console.error("business_trip_report_failed", error instanceof Error ? error.message : error);
  return Response.json({ message: "출장보고서를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export function assertBusinessTripReportOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")
    || new URL(request.url).host;
  try {
    const source = new URL(origin);
    if (["http:", "https:"].includes(source.protocol) && source.host === host) return;
  } catch {
    // Malformed origins are rejected below.
  }
  throw new BusinessTripReportError("다른 사이트에서 보낸 요청은 허용하지 않습니다.", 403);
}

export async function requireBusinessTripReportContext() {
  const db = await createClient();
  const user = await requireCourseOperationsUser(db).catch((error: unknown) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      throw new BusinessTripReportError("로그인이 필요합니다.", 401);
    }
    throw error;
  });
  const membership = await requireCourseOperationsMembership(user.id);
  return {
    admin: createAdminClient(),
    workspaceId: membership.workspace_id as string,
    user,
    isSuperAdmin: isSuperAdminEmail(user.email) || membership.role === "super_admin",
  };
}

type ReportContext = Awaited<ReturnType<typeof requireBusinessTripReportContext>>;

function canManageReport(context: Pick<ReportContext, "user" | "isSuperAdmin">, row: Pick<ReportRow, "author_id">) {
  return canManageBusinessTripReport(context.user.id, row.author_id, context.isSuperAdmin);
}

function normalizeReport(context: Pick<ReportContext, "user" | "isSuperAdmin">, row: ReportRow): BusinessTripReport {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    title: row.title,
    finalCost: Number(row.final_cost),
    paymentCompleted: row.payment_completed,
    paymentCompletedAt: row.payment_completed_at,
    fileName: row.file_name,
    fileSize: row.file_size === null ? null : Number(row.file_size),
    fileMimeType: row.file_mime_type,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canManage: canManageReport(context, row),
  };
}

function databaseError(error: { code?: string; message: string }) {
  if (/PGRST20[045]|42P01|business_trip_reports/u.test(`${error.code ?? ""} ${error.message}`)) {
    throw new BusinessTripReportError("출장보고서 데이터베이스 마이그레이션을 먼저 적용해 주세요.", 503);
  }
  throw new Error(`Business trip report database: ${error.code ?? error.message}`);
}

async function reportRow(context: ReportContext, reportId: string) {
  const { data, error } = await context.admin
    .from("business_trip_reports")
    .select(REPORT_COLUMNS)
    .eq("workspace_id", context.workspaceId)
    .eq("id", reportId)
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new BusinessTripReportError("출장보고서를 찾을 수 없습니다.", 404);
  return data as ReportRow;
}

function assertCanManage(context: ReportContext, row: ReportRow) {
  if (!canManageReport(context, row)) {
    throw new BusinessTripReportError("다른 사람이 작성한 출장보고서는 수정하거나 삭제할 수 없습니다.", 403);
  }
}

function authorName(context: ReportContext) {
  return context.user.displayName?.trim()
    || context.user.email?.split("@")[0]?.trim()
    || "사용자";
}

export async function loadBusinessTripReports(context: ReportContext) {
  const reports: BusinessTripReport[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await context.admin
      .from("business_trip_reports")
      .select(REPORT_COLUMNS)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) databaseError(error);
    const rows = (data ?? []) as ReportRow[];
    reports.push(...rows.map((row) => normalizeReport(context, row)));
    if (rows.length < pageSize) return reports;
  }
}

export async function loadBusinessTripReport(context: ReportContext, reportId: string) {
  return normalizeReport(context, await reportRow(context, reportId));
}

export async function createBusinessTripReport(
  context: ReportContext,
  input: { title: string; finalCost: number; paymentCompleted: boolean },
) {
  const now = new Date().toISOString();
  const { data, error } = await context.admin
    .from("business_trip_reports")
    .insert({
      workspace_id: context.workspaceId,
      author_id: context.user.id,
      author_name: authorName(context),
      title: input.title,
      final_cost: input.finalCost,
      payment_completed: input.paymentCompleted,
      payment_completed_at: input.paymentCompleted ? now : null,
    })
    .select(REPORT_COLUMNS)
    .single();
  if (error) databaseError(error);
  return normalizeReport(context, data as ReportRow);
}

export async function updateBusinessTripReport(
  context: ReportContext,
  reportId: string,
  input: { title: string; finalCost: number; paymentCompleted: boolean; version: number },
) {
  const current = await reportRow(context, reportId);
  assertCanManage(context, current);
  if (current.version !== input.version) {
    throw new BusinessTripReportError("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  }
  const now = new Date().toISOString();
  const { data, error } = await context.admin
    .from("business_trip_reports")
    .update({
      title: input.title,
      final_cost: input.finalCost,
      payment_completed: input.paymentCompleted,
      payment_completed_at: input.paymentCompleted ? current.payment_completed_at ?? now : null,
      version: current.version + 1,
      updated_at: now,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", reportId)
    .eq("version", current.version)
    .select(REPORT_COLUMNS)
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new BusinessTripReportError("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  return normalizeReport(context, data as ReportRow);
}

export async function deleteBusinessTripReport(context: ReportContext, reportId: string, version: number) {
  const current = await reportRow(context, reportId);
  assertCanManage(context, current);
  if (current.version !== version) {
    throw new BusinessTripReportError("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  }
  const { data, error } = await context.admin
    .from("business_trip_reports")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("id", reportId)
    .eq("version", version)
    .select("id")
    .maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new BusinessTripReportError("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  if (current.file_path) {
    const removed = await context.admin.storage.from(BUSINESS_TRIP_REPORT_BUCKET).remove([current.file_path]);
    if (removed.error) console.error("business_trip_report_file_cleanup_failed", removed.error.message);
  }
}

export async function prepareBusinessTripReportUpload(
  context: ReportContext,
  reportId: string,
  file: { fileName: string; fileSize: number; mimeType: string },
) {
  const current = await reportRow(context, reportId);
  assertCanManage(context, current);
  const format = validateBusinessTripFile({ name: file.fileName, size: file.fileSize, type: file.mimeType });
  const path = `${context.workspaceId}/${reportId}/${randomUUID()}.${format.extension}`;
  const { data, error } = await context.admin.storage
    .from(BUSINESS_TRIP_REPORT_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Business trip report signed upload: ${error?.message ?? "missing URL"}`);
  return { path, uploadUrl: data.signedUrl };
}

export async function finalizeBusinessTripReportUpload(
  context: ReportContext,
  reportId: string,
  input: { path: string; fileName: string; fileSize: number; mimeType: string; version: number },
) {
  const current = await reportRow(context, reportId);
  assertCanManage(context, current);
  if (current.version !== input.version) {
    throw new BusinessTripReportError("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  }
  const format = validateBusinessTripFile({ name: input.fileName, size: input.fileSize, type: input.mimeType });
  const prefix = `${context.workspaceId}/${reportId}/`;
  const expectedSuffix = `.${format.extension}`;
  if (!input.path.startsWith(prefix) || !input.path.endsWith(expectedSuffix) || input.path.includes("..")) {
    throw new BusinessTripReportError("업로드한 파일 경로가 올바르지 않습니다.", 400);
  }
  const objectName = input.path.slice(prefix.length);
  if (!objectName || objectName.includes("/")) throw new BusinessTripReportError("업로드한 파일 경로가 올바르지 않습니다.", 400);
  const listed = await context.admin.storage.from(BUSINESS_TRIP_REPORT_BUCKET).list(`${context.workspaceId}/${reportId}`, {
    limit: 100,
    search: objectName,
  });
  if (listed.error || !listed.data.some((item) => item.name === objectName)) {
    throw new BusinessTripReportError("업로드된 파일을 확인할 수 없습니다. 다시 업로드해 주세요.", 400);
  }
  const now = new Date().toISOString();
  const { data, error } = await context.admin
    .from("business_trip_reports")
    .update({
      file_path: input.path,
      file_name: input.fileName,
      file_size: input.fileSize,
      file_mime_type: input.mimeType,
      version: current.version + 1,
      updated_at: now,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", reportId)
    .eq("version", current.version)
    .select(REPORT_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    await context.admin.storage.from(BUSINESS_TRIP_REPORT_BUCKET).remove([input.path]);
    if (error) databaseError(error);
    throw new BusinessTripReportError("다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  }
  if (current.file_path && current.file_path !== input.path) {
    const removed = await context.admin.storage.from(BUSINESS_TRIP_REPORT_BUCKET).remove([current.file_path]);
    if (removed.error) console.error("business_trip_report_old_file_cleanup_failed", removed.error.message);
  }
  return normalizeReport(context, data as ReportRow);
}

export async function businessTripReportDownloadUrl(context: ReportContext, reportId: string) {
  const current = await reportRow(context, reportId);
  if (!current.file_path) throw new BusinessTripReportError("업로드된 출장보고서 파일이 없습니다.", 404);
  const { data, error } = await context.admin.storage
    .from(BUSINESS_TRIP_REPORT_BUCKET)
    .createSignedUrl(current.file_path, 60, { download: current.file_name ?? "출장보고서" });
  if (error || !data) throw new Error(`Business trip report signed download: ${error?.message ?? "missing URL"}`);
  return data.signedUrl;
}

export async function loadBusinessTripDashboardSummary(workspaceId: string): Promise<BusinessTripDashboardSummary> {
  const admin = createAdminClient();
  let unpaidCount = 0;
  let unpaidCost = 0;
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("business_trip_reports")
      .select("final_cost")
      .eq("workspace_id", workspaceId)
      .eq("payment_completed", false)
      .gt("final_cost", 0)
      .range(from, from + pageSize - 1);
    if (error) databaseError(error);
    const rows = data ?? [];
    unpaidCount += rows.length;
    unpaidCost += rows.reduce((sum, row) => sum + Number(row.final_cost), 0);
    if (rows.length < pageSize) return { unpaidCount, unpaidCost };
  }
}
