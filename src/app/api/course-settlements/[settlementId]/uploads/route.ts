import { createHash } from "node:crypto";

import readXlsxFile from "read-excel-file/node";

import {
  aggregateMonthlyAnalyses,
  analyzeWorkbook,
  normalizeName,
  type MonthlyAnalysis,
  type WorkbookInput,
} from "@/lib/course-settlements/engine";
import {
  authorizeSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ settlementId: string }> };
type StoredUpload = {
  id: string;
  checksum_sha256: string;
  storage_path: string | null;
  analysis_snapshot: MonthlyAnalysis | null;
  is_active: boolean;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function periodKey(analysis: MonthlyAnalysis) {
  return analysis.periodYear && analysis.periodMonth
    ? `${analysis.periodYear}-${String(analysis.periodMonth).padStart(2, "0")}`
    : analysis.periodLabel;
}

function transactionRowCount(analysis: MonthlyAnalysis) {
  return Math.max(
    1,
    Object.values(analysis.detailsByInstructor).reduce(
      (total, detail) =>
        total + detail.toss.length + detail.cash.length + detail.service.length,
      0,
    ),
  );
}

async function refreshAnalysis(
  admin: Awaited<ReturnType<typeof authorizeSettlement>>["admin"],
  settlement: Awaited<ReturnType<typeof authorizeSettlement>>["settlement"],
  monthlyAnalyses: MonthlyAnalysis[],
  userId: string,
  reason: string,
) {
  const analysis = monthlyAnalyses.length
    ? aggregateMonthlyAnalyses(monthlyAnalyses)
    : null;
  const currentDraft =
    typeof settlement.statement_draft === "object" &&
    settlement.statement_draft !== null
      ? (settlement.statement_draft as Record<string, unknown>)
      : {};
  const statementDraft = {
    ...currentDraft,
    status: analysis ? "검토대기" : "작성중",
    confirmedAt: "",
  };
  const version = settlement.latest_version + 1;
  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("course_settlement_projects")
    .update({
      analysis_snapshot: analysis,
      statement_draft: statementDraft,
      settlement_months:
        analysis?.monthlyAnalyses.map((month) => month.periodLabel) ?? [],
      latest_version: version,
      status: analysis ? (analysis.allMatched ? "검증완료" : "검증필요") : "자료대기",
      updated_at: now,
    })
    .eq("id", settlement.id)
    .eq("latest_version", settlement.latest_version)
    .select("*")
    .maybeSingle();
  if (error || !updated) {
    throw new Error("정산 자료가 동시에 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
  }

  const { error: versionError } = await admin
    .from("course_settlement_versions")
    .insert({
      settlement_id: settlement.id,
      version,
      input_snapshot: {
        upload_count: monthlyAnalyses.length,
        periods: monthlyAnalyses.map((month) => month.periodLabel),
      },
      result_snapshot: analysis ?? {},
      reason,
      calculated_by: userId,
    });
  if (versionError) throw new Error(`정산 버전 저장 실패: ${versionError.code}`);
  return updated;
}

export async function POST(request: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { settlementId } = await params;
    const { admin, workspaceId, settlement } = await authorizeSettlement(
      settlementId,
      user.id,
    );
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (!files.length) throw new Error("검증할 정산 엑셀을 선택해 주세요.");

    const { data: course } = await admin
      .from("courses")
      .select("id,instructor_name")
      .eq("id", settlement.course_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!course) throw new Error("연결된 강의를 찾을 수 없습니다.");
    const targetInstructor = normalizeName(course.instructor_name);
    if (!targetInstructor) throw new Error("강의에 강사명을 먼저 입력해 주세요.");

    const parsed = [] as Array<{
      file: File;
      bytes: Buffer;
      checksum: string;
      analysis: MonthlyAnalysis;
    }>;
    for (const [index, file] of files.entries()) {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error(`${file.name}: .xlsx 파일만 추가할 수 있습니다.`);
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`${file.name}: 파일 크기가 25 MiB를 초과합니다.`);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const sheets = (await readXlsxFile(bytes)) as unknown as WorkbookInput["sheets"];
      const analysis = analyzeWorkbook({
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        inputOrder: index,
        sheets,
      });
      parsed.push({
        file,
        bytes,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        analysis,
      });
    }

    const incomingPeriods = parsed.map((item) => periodKey(item.analysis));
    if (new Set(incomingPeriods).size !== incomingPeriods.length) {
      throw new Error("같은 정산 월의 엑셀은 한 번에 하나만 추가할 수 있습니다.");
    }

    const { data: existingData, error: existingError } = await admin
      .from("course_settlement_uploads")
      .select("id,checksum_sha256,storage_path,analysis_snapshot,is_active")
      .eq("settlement_id", settlement.id)
      .eq("source_type", "workbook");
    if (existingError) throw new Error(`기존 정산 엑셀 조회 실패: ${existingError.code}`);
    const existing = (existingData ?? []) as StoredUpload[];
    const activeExisting = existing.filter(
      (upload) => upload.is_active && upload.analysis_snapshot,
    );
    const replacedPeriods = new Set(incomingPeriods);
    const keptAnalyses = activeExisting.flatMap((upload) =>
      upload.analysis_snapshot &&
      !replacedPeriods.has(periodKey(upload.analysis_snapshot))
        ? [upload.analysis_snapshot]
        : [],
    );
    const availableInstructors = [
      ...new Set(
        [...keptAnalyses, ...parsed.map((item) => item.analysis)].flatMap(
          (analysis) =>
            analysis.instructorResults.map((item) => item.instructor),
        ),
      ),
    ];
    if (!availableInstructors.includes(targetInstructor)) {
      throw new Error(
        `강사 '${targetInstructor}'의 정산 내역이 없습니다. 확인된 강사: ${availableInstructors.join(", ") || "없음"}`,
      );
    }
    const activatedIds: string[] = [];

    for (const item of parsed) {
      const duplicate = existing.find(
        (upload) => upload.checksum_sha256 === item.checksum,
      );
      let uploadId = duplicate?.id;
      let storagePath = duplicate?.storage_path ?? null;
      if (!storagePath) {
        storagePath = `${workspaceId}/${course.id}/${settlement.id}/${item.checksum}.xlsx`;
        const { error: storageError } = await admin.storage
          .from("course-settlement-files")
          .upload(storagePath, item.bytes, {
            contentType: XLSX_CONTENT_TYPE,
            upsert: true,
          });
        if (storageError) throw new Error(`정산 엑셀 저장 실패: ${storageError.message}`);
      }

      if (uploadId) {
        const { error } = await admin
          .from("course_settlement_uploads")
          .update({
            original_filename: item.file.name,
            storage_path: storagePath,
            row_count: transactionRowCount(item.analysis),
            settlement_months: [item.analysis.periodLabel],
            analysis_snapshot: item.analysis,
            is_active: true,
            replaced_at: null,
          })
          .eq("id", uploadId);
        if (error) throw new Error(`정산 엑셀 갱신 실패: ${error.code}`);
      } else {
        const { data, error } = await admin
          .from("course_settlement_uploads")
          .insert({
            settlement_id: settlement.id,
            source_type: "workbook",
            original_filename: item.file.name,
            checksum_sha256: item.checksum,
            row_count: transactionRowCount(item.analysis),
            settlement_months: [item.analysis.periodLabel],
            rows: [],
            storage_path: storagePath,
            analysis_snapshot: item.analysis,
            is_active: true,
            uploaded_by: user.id,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(`정산 엑셀 기록 실패: ${error?.code}`);
        uploadId = data.id;
      }
      if (!uploadId) throw new Error("정산 엑셀 기록 ID를 확인하지 못했습니다.");
      activatedIds.push(uploadId);
    }

    const replacedIds = activeExisting
      .filter(
        (upload) =>
          upload.analysis_snapshot &&
          replacedPeriods.has(periodKey(upload.analysis_snapshot)) &&
          !activatedIds.includes(upload.id),
      )
      .map((upload) => upload.id);
    if (replacedIds.length) {
      const { error } = await admin
        .from("course_settlement_uploads")
        .update({ is_active: false, replaced_at: new Date().toISOString() })
        .in("id", replacedIds);
      if (error) throw new Error(`이전 정산 엑셀 교체 실패: ${error.code}`);
    }

    const updatedSettlement = await refreshAnalysis(
      admin,
      settlement,
      [...keptAnalyses, ...parsed.map((item) => item.analysis)],
      user.id,
      "정산 엑셀 추가 또는 교체",
    );
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.workbooks_updated",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: {
        course_id: course.id,
        files: parsed.map((item) => item.file.name),
        replaced_count: replacedIds.length,
      },
    });

    return Response.json({
      state: await loadSettlementState(admin, updatedSettlement),
    });
  } catch (error) {
    return settlementError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { settlementId } = await params;
    const { admin, workspaceId, settlement } = await authorizeSettlement(
      settlementId,
      user.id,
    );
    const body = (await request.json()) as { uploadId?: string };
    if (!body.uploadId) throw new Error("삭제할 정산 엑셀을 선택해 주세요.");
    const { data: target } = await admin
      .from("course_settlement_uploads")
      .select("id")
      .eq("id", body.uploadId)
      .eq("settlement_id", settlement.id)
      .eq("source_type", "workbook")
      .eq("is_active", true)
      .maybeSingle();
    if (!target) throw new Error("삭제할 정산 엑셀을 찾을 수 없습니다.");
    const { error: deactivateError } = await admin
      .from("course_settlement_uploads")
      .update({ is_active: false, replaced_at: new Date().toISOString() })
      .eq("id", target.id);
    if (deactivateError) throw new Error(`정산 엑셀 삭제 실패: ${deactivateError.code}`);

    const { data: remaining, error: remainingError } = await admin
      .from("course_settlement_uploads")
      .select("analysis_snapshot")
      .eq("settlement_id", settlement.id)
      .eq("source_type", "workbook")
      .eq("is_active", true);
    if (remainingError) throw new Error(`정산 재계산 자료 조회 실패: ${remainingError.code}`);
    const monthlyAnalyses = (remaining ?? []).flatMap((upload) =>
      upload.analysis_snapshot
        ? [upload.analysis_snapshot as MonthlyAnalysis]
        : [],
    );
    const updatedSettlement = await refreshAnalysis(
      admin,
      settlement,
      monthlyAnalyses,
      user.id,
      "정산 엑셀 제외",
    );
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.workbook_removed",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: { upload_id: target.id },
    });
    return Response.json({
      state: await loadSettlementState(admin, updatedSettlement),
    });
  } catch (error) {
    return settlementError(error);
  }
}
