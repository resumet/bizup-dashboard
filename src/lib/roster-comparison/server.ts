import { refundDate } from "@/lib/jobs/refund";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import type { ComparisonContact, ComparisonRoster } from "./types";

export async function listComparisonRosters(supabase: SupabaseClient): Promise<ComparisonRoster[]> {
  const rosters: ComparisonRoster[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("course_jobs")
      .select("id,name,default_course_name,valid_count,updated_at")
      .eq("status", "ready").order("updated_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (error) throw new Error("수강생 명단을 조회하지 못했습니다. 다시 시도해 주세요.");
    rosters.push(...(data ?? []).map((row) => ({ id: row.id, name: row.name, courseName: row.default_course_name ?? "", count: row.valid_count, updatedAt: row.updated_at })));
    if (!data || data.length < 1000) return rosters;
  }
}

export function parseComparisonRosterIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some((id) => typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(id))) {
    throw new Error("비교할 수강생 명단을 1~100개 선택해 주세요.");
  }
  return [...new Set(value)] as string[];
}

export async function loadComparisonStudents(supabase: SupabaseClient, jobIds: string[], includeRefunded = false): Promise<ComparisonContact[]> {
  // Use the signed-in client: RLS must approve every selected job before loading any contacts.
  const { data: jobs, error } = await supabase.from("course_jobs").select("id,name,latest_version")
    .in("id", jobIds).eq("status", "ready");
  if (error || !jobs || jobs.length !== jobIds.length) throw new Error("선택한 명단 중 조회할 수 없거나 분석이 완료되지 않은 명단이 있습니다. 목록을 새로고침해 주세요.");
  const contacts: ComparisonContact[] = [];
  for (let start = 0; start < jobs.length; start += 4) {
    const batches = await Promise.all(jobs.slice(start, start + 4).map(async (job) => {
      const rows = await loadJobEnrollmentRows(supabase, job.id, job.latest_version, includeRefunded);
      return rows.map((row) => ({ name: row.values?.customerName ?? "", phone: row.normalizedPhone || row.values?.phone || "", email: row.values?.email ?? "", source: job.name, rowNumber: row.sourceRowNumber, refunded: Boolean(refundDate(row.values)) }));
    }));
    for (const batch of batches) for (const contact of batch) contacts.push(contact);
    if (contacts.length > 100_000) throw new Error("수강생은 최대 100,000행까지 비교할 수 있습니다. 선택한 명단 수를 줄여 주세요.");
  }
  return contacts;
}
