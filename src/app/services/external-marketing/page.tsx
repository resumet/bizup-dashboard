import { redirect } from "next/navigation";

import { ExternalMarketingIndex } from "@/components/external-marketing/external-marketing-index";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { loadExternalMarketingProjects } from "@/lib/external-marketing/server";
import { externalMarketingToday } from "@/lib/external-marketing/wbs";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExternalMarketingPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const projects = await loadExternalMarketingProjects(membership.workspace_id);
  return <ExternalMarketingIndex projects={projects} today={externalMarketingToday()} />;
}
