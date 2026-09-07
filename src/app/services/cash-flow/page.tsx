import { redirect } from "next/navigation";

import { CashFlowDashboard } from "@/components/cash-flow/cash-flow-dashboard";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { loadCashFlowDashboard } from "@/lib/cash-flow/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CashFlowPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const data = await loadCashFlowDashboard(membership.workspace_id);

  return <CashFlowDashboard initialData={data} />;
}
