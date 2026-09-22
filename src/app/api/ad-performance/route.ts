import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { adPerformanceErrorResponse, createDashboardSchema } from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [membership, input] = await Promise.all([
      requireCourseOperationsMembership(user.id),
      request.json().then((body) => createDashboardSchema.parse(body)),
    ]);
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id")
      .eq("workspace_id", membership.workspace_id)
      .eq("id", input.courseId)
      .maybeSingle();
    if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
    if (!course) throw new Error("연결할 강의를 찾을 수 없습니다.");
    const { data, error } = await admin
      .from("ad_performance_dashboards")
      .insert({
        workspace_id: membership.workspace_id,
        course_id: input.courseId,
        start_date: input.startDate,
        total_budget: input.totalBudget,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (error?.code === "23505") throw new Error("이 강의의 광고성과 대시보드가 이미 있습니다.");
    if (error) throw new Error(`광고성과 대시보드 생성 실패: ${error.code}`);
    return Response.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
