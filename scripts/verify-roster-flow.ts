import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase 서버 환경변수가 필요합니다.");
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count: jobs } = await admin.from("course_jobs").select("id", { count: "exact", head: true });
  const { count: enrollments } = await admin.from("job_enrollments").select("id", { count: "exact", head: true });
  const { error: messageJobError } = await admin.from("message_jobs").select("id,workspace_id,course_job_id,job_version,template_key,template_code,target_scope,idempotency_key,status,requested_by,requested_count,success_count,failed_count,created_at,completed_at").limit(0);
  const { error: recipientError } = await admin.from("message_recipients").select("id,message_job_id,enrollment_id,normalized_phone,status,http_status,shoong_code,group_id,message_id,failure_reason,requested_at,completed_at").limit(0);
  const { error: addressBookError } = await admin.from("address_books").select("id,workspace_id,name,contact_count,created_by,created_at,updated_at").limit(0);
  const { error: templateError } = await admin.from("message_templates").select("id,workspace_id,name,template_code,applicant_variable,course_variable,is_system").limit(0);
  const requiredShoong = ["SHOONG_API_KEY", "SHOONG_SENDER_KEY", "SHOONG_TEMPLATE_PAID_CONFIRM", "SHOONG_TEMPLATE_PAID_INVITE", "SHOONG_SEND_TYPE"];
  const missingShoong = requiredShoong.filter((key) => !process.env[key]);
  console.log(JSON.stringify({ jobs: jobs ?? 0, enrollments: enrollments ?? 0, messageMigrationApplied: !messageJobError && !recipientError, messageMigrationErrors: [messageJobError?.code, recipientError?.code].filter(Boolean), addressBookMigrationApplied: !addressBookError && !templateError, addressBookMigrationErrors: [addressBookError?.code, templateError?.code].filter(Boolean), missingShoong }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "검증 실패"); process.exitCode = 1; });
