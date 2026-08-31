import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { persistRosterRecords } from "@/lib/import/persist-records";
import {
  analyzeRosterFile,
  MAX_IMPORT_BYTES,
  rosterFileContentType,
} from "@/lib/import/roster";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES + 1024 * 1024) return Response.json({ message: "파일은 20MB 이하여야 합니다." }, { status: 413 });

  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  const admin = createAdminClient();
  const membershipResult = await admin
    .from("workspace_members").select("workspace_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  let membership = membershipResult.data;
  const membershipError = membershipResult.error;

  // 트리거 적용 전에 만들어진 계정도 첫 저장 시 안전하게 복구합니다.
  if (!membershipError && !membership) {
    const workspaceName = `${user.email?.split("@")[0] || "BizUp"} 워크스페이스`;
    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces").insert({ name: workspaceName }).select("id").single();
    if (!workspaceError && workspace) {
      const { error: memberError } = await admin.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.id, role: "admin" });
      if (memberError) await admin.from("workspaces").delete().eq("id", workspace.id);
      else membership = { workspace_id: workspace.id, role: "admin" };
    }
  }
  if (membershipError || !membership) return Response.json({ message: "워크스페이스를 준비하지 못했습니다. Supabase 스키마를 확인해 주세요." }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ message: "CSV 파일을 선택해 주세요." }, { status: 400 });
    const excludeInvalidPhoneRows =
      formData.get("excludeInvalidPhoneRows") === "true";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { preview, records } = await analyzeRosterFile(bytes, file.name);
    if (preview.summary.errorRows > 0 && !excludeInvalidPhoneRows) {
      return Response.json(
        {
          code: "PHONE_ERRORS_REQUIRE_DECISION",
          message: `전화번호 오류 ${preview.summary.errorRows}건을 제외하고 등록할지 확인해 주세요.`,
          errorRows: preview.summary.errorRows,
          validRows: preview.summary.validRows,
        },
        { status: 409 },
      );
    }
    if (records.length === 0) {
      return Response.json(
        { message: "등록할 수 있는 유효한 전화번호가 없습니다." },
        { status: 400 },
      );
    }

    const jobNameInput = String(formData.get("jobName") ?? "").trim();
    const jobName = jobNameInput || file.name.replace(/\.(csv|xlsx)$/i, "");
    const defaultCourseName = String(formData.get("courseName") ?? "").trim() || null;
    const jobId = randomUUID();
    const extension = file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
    const storagePath = `${membership.workspace_id}/${jobId}/v1/${randomUUID()}.${extension}`;
    const { error: jobError } = await admin.from("course_jobs").insert({
      id: jobId, workspace_id: membership.workspace_id, name: jobName,
      default_course_name: defaultCourseName, status: "ready", latest_version: 1,
      valid_count: preview.summary.validRows, error_count: preview.summary.errorRows, created_by: user.id,
    });
    if (jobError) throw new Error(`작업 생성 실패: ${jobError.code}`);

    const { error: uploadError } = await admin.storage.from("course-files").upload(storagePath, bytes, {
      contentType: rosterFileContentType(file.name), upsert: false,
    });
    if (uploadError) {
      await admin.from("course_jobs").delete().eq("id", jobId);
      throw new Error(`원본 파일 저장 실패: ${uploadError.message}`);
    }

    const { error: versionError } = await admin.from("job_file_versions").insert({
      job_id: jobId, version: 1, storage_path: storagePath, original_filename: file.name,
      checksum_sha256: preview.file.checksumSha256, file_size: preview.file.size,
      mapping: preview.mapping, row_count: preview.summary.totalRows, uploaded_by: user.id, applied_at: new Date().toISOString(),
    });
    if (versionError) {
      await admin.storage.from("course-files").remove([storagePath]);
      await admin.from("course_jobs").delete().eq("id", jobId);
      throw new Error(`파일 버전 저장 실패: ${versionError.code}`);
    }

    try {
      await persistRosterRecords(admin, {
        workspaceId: membership.workspace_id,
        jobId,
        version: 1,
        records,
      });
    } catch (recordError) {
      await admin.storage.from("course-files").remove([storagePath]);
      await admin.from("course_jobs").delete().eq("id", jobId);
      throw recordError;
    }

    await admin.from("audit_logs").insert({ workspace_id: membership.workspace_id, actor_id: user.id, event_type: "course_job.created", entity_type: "course_job", entity_id: jobId, metadata: { filename: file.name, row_count: preview.summary.totalRows, excluded_invalid_phone_rows: excludeInvalidPhoneRows ? preview.summary.errorRows : 0 } });
    return Response.json({ jobId, message: "명단 원본과 작업이 저장되었습니다." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "명단을 저장하지 못했습니다.";
    return Response.json({ message }, { status: 400 });
  }
}
