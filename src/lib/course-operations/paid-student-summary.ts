import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CoursePaidStudentSummary = {
  course_id: string;
  paid_student_count: number;
};

export async function loadCoursePaidStudentSummariesFromClient(
  client: SupabaseClient,
  workspaceId: string,
): Promise<CoursePaidStudentSummary[]> {
  const { data: jobs, error } = await client
    .from("course_jobs")
    .select("id,course_id,latest_version")
    .eq("workspace_id", workspaceId)
    .eq("is_order_roster", true)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`유료수강생 명단 조회 실패 (${error.code}): ${error.message}`);
  }

  return Promise.all(
    (jobs ?? []).flatMap((job) =>
      job.course_id
        ? [
            loadJobEnrollmentRows(client, job.id, job.latest_version).then(
              (rows) => ({
                course_id: job.course_id as string,
                paid_student_count: rows.length,
              }),
            ),
          ]
        : [],
    ),
  );
}

export function loadCoursePaidStudentSummaries(workspaceId: string) {
  return loadCoursePaidStudentSummariesFromClient(
    createAdminClient(),
    workspaceId,
  );
}
