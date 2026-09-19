import { loadCoursePaidStudentSummaries } from "@/lib/course-operations/paid-student-summary";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const userId = (await supabase.auth.getUser()).data.user?.id ?? "";
  const membership = await requireCourseOperationsMembership(userId);
  return Response.json(
    await loadCoursePaidStudentSummaries(membership.workspace_id),
  );
}
