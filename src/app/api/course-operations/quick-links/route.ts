import { buildCourseQuickLinks } from "@/lib/course-operations/quick-links";
import { toKoreaDate } from "@/lib/course-operations/schedule";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import {
  courseOperationsApiError,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const { data, error } = await createAdminClient()
      .from("courses")
      .select("id,name,instructor_name,free_webinar_at,landing_page_link,payment_link,course_materials_link,free_kakao_room_1_link,free_kakao_room_2_link,paid_kakao_room_link,communication_room_link,custom_links")
      .eq("workspace_id", membership.workspace_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`강의 바로가기 조회 실패: ${error.code}`);
    const courses = sortByNearestWebinar(data ?? [], toKoreaDate(new Date().toISOString()));
    return Response.json({ courses: courses.map(buildCourseQuickLinks) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
