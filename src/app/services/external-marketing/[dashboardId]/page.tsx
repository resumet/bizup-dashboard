import { notFound, redirect } from "next/navigation";

import { ExternalMarketingDashboard } from "@/components/external-marketing/external-marketing-dashboard";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { loadExternalMarketingProject } from "@/lib/external-marketing/server";
import { externalMarketingToday } from "@/lib/external-marketing/wbs";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExternalMarketingDetailPage({ params, searchParams }: { params: Promise<{ dashboardId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const [{ dashboardId }, membership] = await Promise.all([params, requireCourseOperationsMembership(user.id)]);
  const data = await loadExternalMarketingProject(membership.workspace_id, dashboardId);
  if (!data) notFound();
  const { tab } = await searchParams;
  return <ExternalMarketingDashboard key={`${data.dashboard.sheetState?.updatedAt ?? data.project.updatedAt}:${data.project.updatedAt}:${tab ?? "wbs"}`} project={data.project} dashboard={data.dashboard} today={externalMarketingToday()} initialTab={tab === "performance" ? "performance" : "wbs"} />;
}
