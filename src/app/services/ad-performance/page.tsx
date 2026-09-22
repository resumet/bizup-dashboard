import { redirect } from "next/navigation";

import { AdPerformanceIndex } from "@/components/ad-performance/ad-performance-index";
import { loadAdPerformanceIndex } from "@/lib/ad-performance/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdPerformancePage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const data = await loadAdPerformanceIndex(membership.workspace_id);
  return <AdPerformanceIndex initialData={data} />;
}
