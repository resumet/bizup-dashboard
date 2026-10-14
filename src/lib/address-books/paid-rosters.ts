import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatStudentSettlementHeading } from "@/lib/course-operations/course-detail-heading";

type PaidExclusionRoster = {
  id: string;
  latest_version: number;
  course: {
    id: string;
    name: string;
    instructor_name: string | null;
    cohort: string | null;
    free_webinar_at: string;
  };
};

// Match PaidCourseRoster: the saved paid-students tab, not general roster jobs.
// The inner join excludes deleted/unlinked courses and checks both workspaces.
export function paidExclusionRostersQuery(client: SupabaseClient, workspaceId: string, rosterId?: string) {
  const query = client.from("course_jobs")
    .select("id,latest_version,course:courses!inner(id,name,instructor_name,cohort,free_webinar_at)")
    .eq("workspace_id", workspaceId)
    .eq("course.workspace_id", workspaceId)
    .eq("is_order_roster", true);
  return (rosterId ? query.eq("id", rosterId) : query).returns<PaidExclusionRoster[]>();
}

export function paidExclusionRosterOption(roster: PaidExclusionRoster) {
  return {
    id: roster.id,
    name: formatStudentSettlementHeading({
      courseName: roster.course.name,
      instructorName: roster.course.instructor_name,
      cohort: roster.course.cohort,
      webinarAt: roster.course.free_webinar_at,
    }),
  };
}
