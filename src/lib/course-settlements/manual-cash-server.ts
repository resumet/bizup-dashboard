import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { summarizeManualCash } from "./manual-cash";

export async function loadManualCashSummary(admin: SupabaseClient, courseId: string) {
  const { data: job, error } = await admin.from("course_jobs")
    .select("id,latest_version").eq("course_id", courseId).eq("is_order_roster", true).maybeSingle();
  if (error) throw new Error(`현금결제 명단 조회 실패: ${error.code}`);
  return summarizeManualCash(job ? await loadJobEnrollmentRows(admin, job.id, job.latest_version) : []);
}
