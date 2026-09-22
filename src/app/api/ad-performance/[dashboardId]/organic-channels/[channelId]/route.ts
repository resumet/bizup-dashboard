import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string; channelId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId, channelId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    z.uuid().parse(dashboardId);
    z.uuid().parse(channelId);
    const admin = createAdminClient();
    const { data: dashboard, error: dashboardError } = await admin
      .from("ad_performance_dashboards")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("id", dashboardId)
      .maybeSingle();
    if (dashboardError) throw new Error(`광고성과 조회 실패: ${dashboardError.code}`);
    if (!dashboard) throw new Error("NOT_FOUND");
    const { data, error } = await admin
      .from("ad_performance_organic_channels")
      .delete()
      .eq("dashboard_id", dashboardId)
      .eq("id", channelId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`오가닉 채널 삭제 실패: ${error.code}`);
    if (!data) throw new Error("삭제할 오가닉 채널을 찾을 수 없습니다.");
    return Response.json({ deleted: true });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
