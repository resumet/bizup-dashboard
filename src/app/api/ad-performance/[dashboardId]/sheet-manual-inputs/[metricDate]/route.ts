import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import {
  authorizeAdPerformanceDashboard,
  loadAdPerformanceSheetState,
  persistAdPerformanceSheetState,
} from "@/lib/ad-performance/sheet-server";
import {
  resolveAdPerformanceSourceDate,
  updateSheetChatMembers,
} from "@/lib/ad-performance/sheet-workspace";
import { sheetManualInputSchema } from "@/lib/ad-performance/sheet-validation";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ dashboardId: string; metricDate: string }>;
};

export async function PUT(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId, metricDate }, membership, body] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json(),
    ]);
    const input = sheetManualInputSchema.parse({ ...body, metricDate });
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
    const sourceDates = new Set(
      current.sourceRows
        .slice(2)
        .map((row) => resolveAdPerformanceSourceDate(row[0], context.startDate))
        .filter((date): date is string => Boolean(date)),
    );
    if (!sourceDates.has(input.metricDate)) {
      throw new Error("원본 시트에 없는 날짜입니다.");
    }
    const manualInputs = updateSheetChatMembers(
      current.manualInputs,
      input.metricDate,
      input.chatMembersCumulative,
    );
    const saved = await persistAdPerformanceSheetState({
      context,
      actorId: user.id,
      expectedVersion: current.version,
      state: { ...current, manualInputs },
    });
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
