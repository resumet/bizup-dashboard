import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoredRosterRecord } from "./roster";

type PersistRecordsInput = {
  workspaceId: string;
  jobId: string;
  version: number;
  records: StoredRosterRecord[];
};

export async function persistRosterRecords(
  admin: SupabaseClient,
  { workspaceId, jobId, version, records }: PersistRecordsInput,
) {
  if (records.length === 0) return;

  const uniqueStudents = [...new Map(records.map((record) => [record.normalizedPhone, record])).values()];
  const studentIds = new Map<string, string>();
  for (let start = 0; start < uniqueStudents.length; start += 500) {
    const batch = uniqueStudents.slice(start, start + 500);
    const { data: students, error: studentError } = await admin
      .from("students")
      .upsert(
        batch.map((record) => ({
        workspace_id: workspaceId,
        normalized_phone: record.normalizedPhone,
        name: record.normalizedValues.customerName || null,
        email: record.normalizedValues.email || null,
        profile: {
          referrer: record.normalizedValues.referrer,
          source: record.normalizedValues.source,
          adMedia: record.normalizedValues.adMedia,
        },
        updated_at: new Date().toISOString(),
        })),
        { onConflict: "workspace_id,normalized_phone" },
      )
      .select("id,normalized_phone");
    if (studentError)
      throw new Error(`수강생 저장 실패: ${studentError.code}`);
    (students ?? []).forEach((student) =>
      studentIds.set(student.normalized_phone, student.id),
    );
  }
  const { error: cleanupError } = await admin
    .from("job_enrollments")
    .delete()
    .eq("job_id", jobId)
    .eq("version", version);
  if (cleanupError) throw new Error(`기존 상세 명단 정리 실패: ${cleanupError.code}`);

  for (let start = 0; start < records.length; start += 500) {
    const batch = records.slice(start, start + 500);
    const { error: enrollmentError } = await admin
      .from("job_enrollments")
      .insert(
        batch.map((record) => ({
          job_id: jobId,
          version,
          student_id: studentIds.get(record.normalizedPhone) ?? null,
          normalized_phone: record.normalizedPhone,
          normalized_values: record.normalizedValues,
          original_values: record.originalValues,
          source_row_number: record.sourceRowNumber,
          is_duplicate: record.isDuplicate,
          is_extra_participant: record.isExtraParticipant === true,
        })),
      );
    if (enrollmentError)
      throw new Error(`상세 명단 저장 실패: ${enrollmentError.code}`);
  }
}
