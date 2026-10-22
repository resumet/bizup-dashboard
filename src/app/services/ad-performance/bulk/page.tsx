import { redirect } from "next/navigation";
import { AdPerformanceBulk } from "@/components/ad-performance/ad-performance-bulk";
import { loadAdPerformanceBulk } from "@/lib/ad-performance/bulk-server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdPerformanceBulkPage() {
  const client = await createClient();
  const user = await getAuthenticatedUser(client);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const rows = await loadAdPerformanceBulk(membership.workspace_id, client);
  return <AdPerformanceBulk rows={rows} />;
}
