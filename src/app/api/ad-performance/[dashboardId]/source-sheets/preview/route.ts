import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import {
  authorizeAdPerformanceDashboard,
  listGoogleSheetNames,
  loadSharedAdSpreadsheetUrl,
  loadGoogleWorkbook,
} from "@/lib/ad-performance/sheet-server";
import { sharedSourcePreviewSchema, sourcePreviewSchema } from "@/lib/ad-performance/sheet-validation";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId }, membership, input] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json().then((body) => z.union([sharedSourcePreviewSchema, sourcePreviewSchema]).parse(body)),
    ]);
    const validDashboardId = z.uuid().parse(dashboardId);
    const context = await authorizeAdPerformanceDashboard(
      validDashboardId,
      membership.workspace_id,
    );
    if ("source" in input) {
      const url = await loadSharedAdSpreadsheetUrl(context);
      const { spreadsheetId, names } = await listGoogleSheetNames(url, context.startDate);
      return Response.json({ spreadsheetId, sheets: names.map(name => ({ name })) });
    }
    const workbook = await loadGoogleWorkbook(input.url, context.startDate);
    return Response.json({
      spreadsheetId: workbook.spreadsheetId,
      sheets: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        rowCount: Math.max(0, sheet.rows.length - 2),
      })),
      defaultSheetName: workbook.sheets[0]?.name ?? "",
    });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
