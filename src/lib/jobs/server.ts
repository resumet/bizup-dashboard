import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StandardField } from "@/lib/import/contract";
import type { RosterRow } from "./types";

export async function loadJobEnrollmentRows(
  supabase: SupabaseClient,
  jobId: string,
  version: number,
) {
  const rows: RosterRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("job_enrollments")
      .select(
        "id,source_row_number,normalized_phone,normalized_values,is_duplicate,is_extra_participant",
      )
      .eq("job_id", jobId)
      .eq("version", version)
      .order("source_row_number")
      .range(start, start + 999);
    if (error) throw new Error(`상세 명단 조회 실패: ${error.code}`);
    rows.push(
      ...(data ?? []).map((row) => {
        const normalizedValues = row.normalized_values as Record<
          string,
          unknown
        > | null;
        return {
          id: row.id,
          sourceRowNumber: row.source_row_number,
          normalizedPhone: row.normalized_phone ?? "",
          isDuplicate: row.is_duplicate,
          groupChatJoined: normalizedValues?.groupChatJoined === true,
          isExtraParticipant: row.is_extra_participant === true,
          memo:
            typeof normalizedValues?.memo === "string"
              ? normalizedValues.memo
              : "",
          values: row.normalized_values as Record<StandardField, string>,
        };
      }),
    );
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

export async function loadJobRoster(supabase: SupabaseClient, jobId: string) {
  const { data: job, error: jobError } = await supabase
    .from("course_jobs")
    .select("id,workspace_id,name,default_course_name,latest_version")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) throw new Error("작업을 찾을 수 없거나 접근 권한이 없습니다.");

  const rows = await loadJobEnrollmentRows(
    supabase,
    jobId,
    job.latest_version,
  );
  return { job, rows };
}
