import { redirect } from "next/navigation";

import { CourseSchedulePlanner } from "@/components/course-schedule-planner/course-schedule-planner";
import { loadCourseSchedulePlanner } from "@/lib/course-schedule-planner/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseSchedulePlannerPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const data = await loadCourseSchedulePlanner(membership.workspace_id);
  return <CourseSchedulePlanner initialData={data} />;
}
