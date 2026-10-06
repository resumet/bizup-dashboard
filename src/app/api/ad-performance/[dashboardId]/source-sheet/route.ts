import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import {
  authorizeAdPerformanceDashboard,
  loadAdPerformanceSheetState,
  loadGoogleWorkbook,
  persistAdPerformanceSheetState,
  refreshAdPerformanceTrackingImport,
} from "@/lib/ad-performance/sheet-server";
import { sourceConnectionSchema } from "@/lib/ad-performance/sheet-validation";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId }, membership, input] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json().then((body) => sourceConnectionSchema.parse(body)),
    ]);
    const validDashboardId = z.uuid().parse(dashboardId);
    const context = await authorizeAdPerformanceDashboard(
      validDashboardId,
      membership.workspace_id,
    );
    const workbook = await loadGoogleWorkbook(input.url, context.startDate);
    const selectedSheet = workbook.sheets.find(
      (sheet) => sheet.name === input.sheetName,
    );
    if (!selectedSheet) {
      throw new Error("선택한 시트를 원본 문서에서 찾을 수 없습니다.");
    }
    const current = await loadAdPerformanceSheetState(
      validDashboardId,
      context.startDate,
    );
    const saved = await persistAdPerformanceSheetState({
      context,
      actorId: user.id,
      expectedVersion: current?.version ?? 0,
      state: {
        spreadsheetUrl: input.url.trim(),
        spreadsheetId: workbook.spreadsheetId,
        sheetName: selectedSheet.name,
        sourceRows: selectedSheet.rows,
        trackingFileName: current?.trackingFileName ?? null,
        tracking: current?.tracking ?? null,
        manualInputs: current?.manualInputs ?? {},
      },
    });
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    const validDashboardId = z.uuid().parse(dashboardId);
    const context = await authorizeAdPerformanceDashboard(
      validDashboardId,
      membership.workspace_id,
    );
    const current = await loadAdPerformanceSheetState(
      validDashboardId,
      context.startDate,
    );
    if (!current) throw new Error("원본 시트를 먼저 연결해 주세요.");

    const workbook = await loadGoogleWorkbook(
      current.spreadsheetUrl,
      context.startDate,
    );
    const selectedSheet = workbook.sheets.find(
      (sheet) => sheet.name === current.sheetName,
    );
    if (!selectedSheet) {
      throw new Error("연결된 시트를 원본 문서에서 찾을 수 없습니다.");
    }
    const tracking = current.tracking?.sourceStoragePath
      ? await refreshAdPerformanceTrackingImport(
          context,
          current.tracking.sourceStoragePath,
        )
      : current.tracking;
    const previousDateCount = Math.max(0, current.sourceRows.length - 2);
    const saved = await persistAdPerformanceSheetState({
      context,
      actorId: user.id,
      expectedVersion: current.version,
      state: {
        spreadsheetUrl: current.spreadsheetUrl,
        spreadsheetId: workbook.spreadsheetId,
        sheetName: selectedSheet.name,
        sourceRows: selectedSheet.rows,
        trackingFileName: current.trackingFileName,
        tracking,
        manualInputs: current.manualInputs,
      },
    });
    return Response.json({
      saved: true,
      addedDateCount: Math.max(
        0,
        Math.max(0, selectedSheet.rows.length - 2) - previousDateCount,
      ),
      ...saved,
    });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
