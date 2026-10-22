import {
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import {
  DEFAULT_AD_PERFORMANCE_BUDGET,
  defaultAdPerformanceStartDate,
  adPerformanceErrorResponse,
} from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  let dashboardId = "";
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const admin = createAdminClient();
    const { data: dashboard, error: dashboardError } = await admin
      .from("ad_performance_dashboards")
      .insert({
        workspace_id: membership.workspace_id,
        service_scope: "external_marketing",
        course_id: null,
        start_date: defaultAdPerformanceStartDate(),
        total_budget: DEFAULT_AD_PERFORMANCE_BUDGET,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (dashboardError) throw new Error(`외부마케팅대행 생성 실패: ${dashboardError.code}`);
    dashboardId = dashboard.id;
    const { error: projectError } = await admin
      .from("external_marketing_projects")
      .insert({
        dashboard_id: dashboardId,
        intake_enabled: false,
        workspace_id: membership.workspace_id,
        created_by: user.id,
        updated_by: user.id,
      });
    if (projectError) throw new Error(`외부마케팅대행 설정 생성 실패: ${projectError.code}`);
    return Response.json({ id: dashboardId }, { status: 201 });
  } catch (error) {
    if (dashboardId) {
      await createAdminClient().from("ad_performance_dashboards").delete().eq("id", dashboardId);
    }
    return adPerformanceErrorResponse(error);
  }
}
