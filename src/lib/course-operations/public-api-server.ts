import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sortByNearestWebinar } from "./webinar-proximity";
import type { PublicCourse } from "./public-api";

export async function loadPublicCourses(): Promise<PublicCourse[]> {
  const admin = createAdminClient();
  let workspaceId = process.env.PRIMARY_WORKSPACE_ID?.trim() || process.env.COURSE_INTAKE_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    const { data, error } = await admin.from("workspaces").select("id").eq("is_primary", true).single();
    if (error || !data) throw new Error("Primary workspace unavailable");
    workspaceId = data.id;
  }
  const courses: { id: string; name: string; instructor_name: string; cohort: string; free_webinar_at: string | null }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from("courses").select("id,name,instructor_name,cohort,free_webinar_at")
      .eq("workspace_id", workspaceId).order("id").range(offset, offset + 499);
    if (error) throw new Error("Courses unavailable");
    courses.push(...data);
    if (data.length < 500) break;
  }
  return sortByNearestWebinar(courses).map(course => ({
    id: course.id, name: course.name, instructorName: course.instructor_name, cohort: course.cohort,
    webinarDate: course.free_webinar_at,
  }));
}
