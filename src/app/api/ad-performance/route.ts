import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import {
  adPerformanceErrorResponse,
  createDashboardSchema,
  DEFAULT_AD_PERFORMANCE_BUDGET,
  defaultAdPerformanceStartDate,
} from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [membership] = await Promise.all([
      requireCourseOperationsMembership(user.id),
      request.json().then((body) => createDashboardSchema.parse(body)),
    ]);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ad_performance_dashboards")
      .insert({
        workspace_id: membership.workspace_id,
        course_id: null,
        start_date: defaultAdPerformanceStartDate(),
        total_budget: DEFAULT_AD_PERFORMANCE_BUDGET,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`광고성과 대시보드 생성 실패: ${error.code}`);
    return Response.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
