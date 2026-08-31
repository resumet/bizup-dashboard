import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase 서버 환경변수가 필요합니다.");
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: job, error: jobError } = await admin.from("message_jobs").select("id,status,requested_count,success_count,failed_count,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (jobError) throw jobError;
  if (!job) { console.log("발송 기록 없음"); return; }
  const { data: recipients, error } = await admin.from("message_recipients").select("status,http_status,shoong_code,failure_reason").eq("message_job_id", job.id);
  if (error) throw error;
  const reasons = new Map<string, number>();
  for (const recipient of recipients ?? []) {
    const key = JSON.stringify({ status: recipient.status, httpStatus: recipient.http_status, shoongCode: recipient.shoong_code, reason: recipient.failure_reason });
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  console.log(JSON.stringify({ job: { status: job.status, requestedCount: job.requested_count, successCount: job.success_count, failedCount: job.failed_count, createdAt: job.created_at }, results: [...reasons].map(([result, count]) => ({ ...JSON.parse(result), count })) }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "조회 실패"); process.exitCode = 1; });
