import { refreshCreativeData } from "@/lib/ad-creative/refresh";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 180;

export async function POST() {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const admin = createAdminClient();
    const rows: { id: string; name: string; free_webinar_at: string | null; dashboards: { id: string }[] }[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin.from("courses").select("id,name,free_webinar_at,dashboards:ad_performance_dashboards(id)")
        .eq("workspace_id", membership.workspace_id).eq("status", "ongoing")
        .eq("dashboards.workspace_id", membership.workspace_id).eq("dashboards.service_scope", "bizup")
        .order("id").range(offset, offset + pageSize - 1);
      if (error) throw new Error("업데이트할 강의를 불러오지 못했습니다.");
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    const courses = sortByNearestWebinar(rows).map(row => ({ courseId: row.id, name: row.name, dashboardId: row.dashboards[0]?.id ?? null }));
    let creativeError = "";
    if (courses.some(course => course.dashboardId)) {
      try {
        await refreshCreativeData(membership.workspace_id, user.id);
      } catch (error) {
        creativeError = error instanceof Error ? error.message : "공통 소재성과를 갱신하지 못했습니다.";
      }
    }
    return Response.json({ courses, creativeError }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adPerformanceErrorResponse(error); }
}
