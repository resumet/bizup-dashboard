import { randomUUID } from "node:crypto";

import { persistRosterRecords } from "@/lib/import/persist-records";
import {
  buildUpdatedRosterRecords,
  compareRosterRecords,
  toRosterDiffItem,
} from "@/lib/import/roster-diff";
import {
  analyzeRosterFile,
  MAX_IMPORT_BYTES,
  rosterFileContentType,
  type StoredRosterRecord,
} from "@/lib/import/roster";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type Context = { params: Promise<{ jobId: string }> };

async function loadAllCurrentRecords(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  version: number,
) {
  const records: StoredRosterRecord[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await admin
      .from("job_enrollments")
      .select(
        "source_row_number,normalized_phone,normalized_values,original_values,is_duplicate,is_extra_participant",
      )
      .eq("job_id", jobId)
      .eq("version", version)
      .order("source_row_number")
      .range(start, start + 999);
    if (error) throw new Error(`기존 명단 조회 실패: ${error.code}`);
    records.push(
      ...(data ?? []).map((row) => ({
        sourceRowNumber: row.source_row_number,
        normalizedPhone: row.normalized_phone ?? "",
        normalizedValues: row.normalized_values as StoredRosterRecord["normalizedValues"],
        originalValues: row.original_values as Record<string, string>,
        isDuplicate: row.is_duplicate,
        isExtraParticipant: row.is_extra_participant === true,
      })),
    );
    if ((data?.length ?? 0) < 1000) break;
  }
  return records;
}

export async function POST(request: Request, { params }: Context) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES + 1024 * 1024) {
    return Response.json(
      { message: "파일은 20MB 이하여야 합니다." },
      { status: 413 },
    );
  }

  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const formData = await request.formData();
    const action = String(formData.get("action") ?? "preview");
    const file = formData.get("file");
    if (!(file instanceof File))
      return Response.json(
        { message: "CSV 또는 XLSX 파일을 선택해 주세요." },
        { status: 400 },
      );

    const { data: job } = await supabase
      .from("course_jobs")
      .select("id,workspace_id,latest_version")
      .eq("id", jobId)
      .maybeSingle();
    if (!job)
      return Response.json(
        { message: "작업을 찾을 수 없거나 접근 권한이 없습니다." },
        { status: 404 },
      );

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { preview, records: incomingRecords } = await analyzeRosterFile(
      bytes,
      file.name,
    );
    if (preview.summary.errorRows > 0) {
      return Response.json(
        {
          message: `전화번호 오류 ${preview.summary.errorRows}건을 먼저 수정해 주세요.`,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const currentRecords = await loadAllCurrentRecords(
      admin,
      jobId,
      job.latest_version,
    );
    const diff = compareRosterRecords(currentRecords, incomingRecords);

    if (action === "preview") {
      return Response.json({
        file: preview.file,
        currentVersion: job.latest_version,
        summary: {
          current: currentRecords.length,
          incoming: incomingRecords.length,
          additions: diff.additions.length,
          removals: diff.removals.length,
          unchanged: diff.matches.length,
        },
        additions: diff.additions.map(toRosterDiffItem),
        removals: diff.removals.map(toRosterDiffItem),
      });
    }
    if (action !== "apply")
      return Response.json(
        { message: "요청 작업을 확인해 주세요." },
        { status: 400 },
      );

    const expectedVersion = Number(formData.get("expectedVersion"));
    const expectedChecksum = String(formData.get("expectedChecksum") ?? "");
    if (
      expectedVersion !== job.latest_version ||
      expectedChecksum !== preview.file.checksumSha256
    ) {
      return Response.json(
        {
          message:
            "미리보기 이후 파일이나 명단 버전이 변경되었습니다. 다시 비교해 주세요.",
        },
        { status: 409 },
      );
    }

    const approveAdditions = formData.get("approveAdditions") === "true";
    const approveRemovals = formData.get("approveRemovals") === "true";
    const finalRecords = buildUpdatedRosterRecords(
      currentRecords,
      incomingRecords,
      { approveAdditions, approveRemovals },
    );
    if (finalRecords.length === 0)
      throw new Error("적용 후 남는 수강생이 없습니다. 삭제 승인을 확인해 주세요.");

    const nextVersion = job.latest_version + 1;
    const extension = file.name.toLowerCase().endsWith(".xlsx")
      ? "xlsx"
      : "csv";
    const storagePath = `${job.workspace_id}/${jobId}/v${nextVersion}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("course-files")
      .upload(storagePath, bytes, {
        contentType: rosterFileContentType(file.name),
        upsert: false,
      });
    if (uploadError)
      throw new Error(`원본 파일 저장 실패: ${uploadError.message}`);

    let versionSaved = false;
    try {
      const { error: versionError } = await admin
        .from("job_file_versions")
        .insert({
          job_id: jobId,
          version: nextVersion,
          storage_path: storagePath,
          original_filename: file.name,
          checksum_sha256: preview.file.checksumSha256,
          file_size: preview.file.size,
          mapping: preview.mapping,
          row_count: preview.summary.totalRows,
          uploaded_by: user.id,
          applied_at: new Date().toISOString(),
        });
      if (versionError)
        throw new Error(
          versionError.code === "23505"
            ? "이미 추가한 파일이거나 다른 업데이트가 먼저 적용되었습니다."
            : `파일 버전 저장 실패: ${versionError.code}`,
        );
      versionSaved = true;

      await persistRosterRecords(admin, {
        workspaceId: job.workspace_id,
        jobId,
        version: nextVersion,
        records: finalRecords,
      });

      const { data: updatedJob, error: updateError } = await admin
        .from("course_jobs")
        .update({
          latest_version: nextVersion,
          valid_count: finalRecords.length,
          error_count: 0,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("latest_version", expectedVersion)
        .select("id")
        .maybeSingle();
      if (updateError || !updatedJob)
        throw new Error("다른 업데이트가 먼저 적용되었습니다. 다시 시도해 주세요.");
    } catch (error) {
      await admin
        .from("job_enrollments")
        .delete()
        .eq("job_id", jobId)
        .eq("version", nextVersion);
      if (versionSaved)
        await admin
          .from("job_file_versions")
          .delete()
          .eq("job_id", jobId)
          .eq("version", nextVersion);
      await admin.storage.from("course-files").remove([storagePath]);
      throw error;
    }

    await admin.from("audit_logs").insert({
      workspace_id: job.workspace_id,
      actor_id: user.id,
      event_type: "course_job.roster_updated",
      entity_type: "course_job",
      entity_id: jobId,
      metadata: {
        previous_version: expectedVersion,
        version: nextVersion,
        filename: file.name,
        additions_found: diff.additions.length,
        removals_found: diff.removals.length,
        additions_applied: approveAdditions ? diff.additions.length : 0,
        removals_applied: approveRemovals ? diff.removals.length : 0,
        final_count: finalRecords.length,
      },
    });

    return Response.json({
      message: "새 명단 버전을 적용했습니다.",
      version: nextVersion,
      finalCount: finalRecords.length,
      additionsApplied: approveAdditions ? diff.additions.length : 0,
      removalsApplied: approveRemovals ? diff.removals.length : 0,
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "명단을 업데이트하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
