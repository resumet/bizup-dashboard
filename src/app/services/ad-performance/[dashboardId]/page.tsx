import { notFound, redirect } from "next/navigation";

import { AdPerformanceDashboard } from "@/components/ad-performance/ad-performance-dashboard";
import { loadAdPerformanceDashboard } from "@/lib/ad-performance/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdPerformanceDetailPage({ params }: { params: Promise<{ dashboardId: string }> }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const [{ dashboardId }, membership] = await Promise.all([
    params,
    requireCourseOperationsMembership(user.id),
  ]);
  const data = await loadAdPerformanceDashboard(membership.workspace_id, dashboardId);
  if (!data) notFound();
  return <AdPerformanceDashboard initialData={data} />;
}
