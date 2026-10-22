import { notFound, redirect } from "next/navigation";

import { ExternalMarketingDashboard } from "@/components/external-marketing/external-marketing-dashboard";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { loadExternalMarketingProject } from "@/lib/external-marketing/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExternalMarketingDetailPage({ params }: { params: Promise<{ dashboardId: string }> }) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const [{ dashboardId }, membership] = await Promise.all([params, requireCourseOperationsMembership(user.id)]);
  const data = await loadExternalMarketingProject(membership.workspace_id, dashboardId);
  if (!data) notFound();
  return <ExternalMarketingDashboard key={data.dashboard.sheetState?.updatedAt ?? data.project.updatedAt} project={data.project} dashboard={data.dashboard} />;
}
