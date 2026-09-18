import { loadCoursePaymentSummaries } from "@/lib/course-operations/payment-summary";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const membership = await requireCourseOperationsMembership((await supabase.auth.getUser()).data.user?.id ?? "");
  return Response.json(await loadCoursePaymentSummaries(membership.workspace_id));
}
