import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { summarizePaidRoster } from "@/lib/jobs/paid-roster-summary";

export type WebinarPayments = { payment_count: number; revenue: number };

// Use the very same latest, non-refunded roster and payer calculation as the paid
// student page. Do not substitute order counts, or persist a stale financial snapshot.
export async function loadWebinarPayments(client: SupabaseClient, courseIds: string[]) {
  const payments = new Map<string, WebinarPayments>(courseIds.map((id) => [id, { payment_count: 0, revenue: 0 }]));
  const jobs: { id: string; course_id: string; latest_version: number }[] = [];
  for (let batch = 0; batch < courseIds.length; batch += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("course_jobs").select("id,course_id,latest_version")
        .in("course_id", courseIds.slice(batch, batch + 100)).eq("is_order_roster", true)
        .order("id").range(offset, offset + 499);
      if (error) throw new Error(`유료수강생 결제 요약 조회 실패: ${error.code}`);
      jobs.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const rowsByCourse = new Map<string, Awaited<ReturnType<typeof loadJobEnrollmentRows>>>();
  // Bound the number of concurrent paginated roster reads for large workspaces.
  for (let start = 0; start < jobs.length; start += 10) {
    const loaded = await Promise.all(jobs.slice(start, start + 10).map(async (job) => ({
      courseId: job.course_id, rows: await loadJobEnrollmentRows(client, job.id, job.latest_version),
    })));
    for (const { courseId, rows } of loaded) rowsByCourse.set(courseId, [...(rowsByCourse.get(courseId) ?? []), ...rows]);
  }
  for (const [courseId, rows] of rowsByCourse) {
    const summary = summarizePaidRoster(rows);
    payments.set(courseId, { payment_count: summary.payerCount, revenue: summary.paymentAmount });
  }
  return payments;
}
