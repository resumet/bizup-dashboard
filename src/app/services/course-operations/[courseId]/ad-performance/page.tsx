import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";

export default async function CourseAdPerformancePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const { courseId } = await params;
  const admin = createAdminClient();
  const [course, dashboard] = await Promise.all([
    admin.from("courses").select("id").eq("id", courseId).eq("workspace_id", membership.workspace_id).maybeSingle(),
    admin.from("ad_performance_dashboards").select("id").eq("course_id", courseId).eq("workspace_id", membership.workspace_id).eq("service_scope", "bizup").maybeSingle(),
  ]);
  if (course.error || dashboard.error) throw new Error("강의 광고성과를 확인하지 못했습니다.");
  if (!course.data) notFound();
  redirect(dashboard.data ? `/services/ad-performance/${dashboard.data.id}` : "/services/ad-performance/daily");
}
