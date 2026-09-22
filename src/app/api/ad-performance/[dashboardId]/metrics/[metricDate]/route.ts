import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { adPerformanceErrorResponse, dateValue } from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string; metricDate: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId, metricDate }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    z.uuid().parse(dashboardId);
    dateValue.parse(metricDate);
    const admin = createAdminClient();
    const { data: dashboard, error: dashboardError } = await admin
      .from("ad_performance_dashboards")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("id", dashboardId)
      .maybeSingle();
    if (dashboardError) throw new Error(`광고성과 조회 실패: ${dashboardError.code}`);
    if (!dashboard) throw new Error("NOT_FOUND");
    const { error } = await admin
      .from("ad_performance_dashboard_metrics")
      .delete()
      .eq("dashboard_id", dashboardId)
      .eq("metric_date", metricDate);
    if (error) throw new Error(`날짜별 광고성과 삭제 실패: ${error.code}`);
    return Response.json({ deleted: true });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
