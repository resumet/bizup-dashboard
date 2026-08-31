import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { analyzeRosterCsv } from "../src/lib/import/roster";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error("Supabase 서버 환경변수가 필요합니다.");
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
const { data: jobs, error: jobsError } = await admin.from("course_jobs").select("id,workspace_id,latest_version");
if (jobsError) throw jobsError;
let jobCount = 0; let rowCount = 0;

for (const job of jobs ?? []) {
  const { count } = await admin.from("job_enrollments").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("version", job.latest_version);
  if ((count ?? 0) > 0) continue;
  const { data: version, error: versionError } = await admin.from("job_file_versions").select("storage_path,original_filename").eq("job_id", job.id).eq("version", job.latest_version).single();
  if (versionError) throw versionError;
  const { data: file, error: downloadError } = await admin.storage.from("course-files").download(version.storage_path);
  if (downloadError) throw downloadError;
  const { preview, records } = analyzeRosterCsv(new Uint8Array(await file.arrayBuffer()), version.original_filename);
  if (preview.summary.errorRows > 0) throw new Error(`작업 ${job.id}에 유효성 오류가 있어 보강을 중단했습니다.`);

  const uniqueStudents = [...new Map(records.map((record) => [record.normalizedPhone, record])).values()];
  const { data: students, error: studentsError } = await admin.from("students").upsert(uniqueStudents.map((record) => ({ workspace_id: job.workspace_id, normalized_phone: record.normalizedPhone, name: record.normalizedValues.customerName || null, email: record.normalizedValues.email || null, profile: { referrer: record.normalizedValues.referrer, source: record.normalizedValues.source, adMedia: record.normalizedValues.adMedia }, updated_at: new Date().toISOString() })), { onConflict: "workspace_id,normalized_phone" }).select("id,normalized_phone");
  if (studentsError) throw studentsError;
  const studentIds = new Map((students ?? []).map((student) => [student.normalized_phone, student.id]));
  const { error: insertError } = await admin.from("job_enrollments").insert(records.map((record) => ({ job_id: job.id, version: job.latest_version, student_id: studentIds.get(record.normalizedPhone) ?? null, normalized_phone: record.normalizedPhone, normalized_values: record.normalizedValues, original_values: record.originalValues, source_row_number: record.sourceRowNumber, is_duplicate: record.isDuplicate })));
  if (insertError) throw insertError;
  jobCount += 1; rowCount += records.length;
}

console.log(`보강 완료: 작업 ${jobCount}건, 상세 행 ${rowCount}건`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "상세 명단 보강 실패");
  process.exitCode = 1;
});
