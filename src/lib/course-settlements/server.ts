import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { filterSettlementCosts, loadCourseCosts } from "@/lib/course-costs/server";
import type { CourseCost } from "@/lib/course-costs/types";
import { sanitizeSettlementStatementDraft } from "@/lib/course-settlements/statement";

type SettlementRecord = {
  id: string;
  workspace_id: string;
  course_id: string;
  status: string;
  latest_version: number;
  analysis_snapshot: unknown;
  statement_draft: unknown;
  updated_at: string;
};

export async function getWorkspaceForUser(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (error || !data) throw new Error("워크스페이스 권한이 없습니다.");
  return { admin, workspaceId: data.workspace_id as string };
}

export async function authorizeSettlement(settlementId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_settlement_projects")
    .select("*")
    .eq("id", settlementId)
    .maybeSingle();
  if (error) throw new Error(error.code === "PGRST205" ? "강의별 정산 DB 마이그레이션을 먼저 적용해 주세요." : `정산 조회 실패: ${error.code}`);
  if (!data) throw new Error("정산 프로젝트를 찾을 수 없습니다.");
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", data.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) throw new Error("정산 프로젝트에 접근할 권한이 없습니다.");
  return {
    admin,
    workspaceId: data.workspace_id as string,
    role: membership.role as string,
    settlement: data as SettlementRecord,
  };
}

export async function authorizeCourseSettlement(courseId: string, userId: string) {
  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .select("id,name,instructor_name,starts_at,workspace_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!course) throw new Error("강의를 찾을 수 없습니다.");
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", course.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) throw new Error("강의에 접근할 권한이 없습니다.");
  return { admin, workspaceId: course.workspace_id as string, course };
}

async function signedUrl(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  path: string | null,
) {
  if (!path) return null;
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function loadSettlementState(
  admin: ReturnType<typeof createAdminClient>,
  settlement: SettlementRecord,
) {
  const [uploadResult, attachmentResult] = await Promise.all([
    admin
      .from("course_settlement_uploads")
      .select(
        "id,original_filename,storage_path,settlement_months,created_at",
      )
      .eq("settlement_id", settlement.id)
      .eq("source_type", "workbook")
      .eq("is_active", true)
      .order("created_at"),
    admin
      .from("course_settlement_draft_attachments")
      .select(
        "id,cost_id,storage_path,original_filename,mime_type,file_size,created_at",
      )
      .eq("settlement_id", settlement.id)
      .order("created_at"),
  ]);
  if (uploadResult.error) {
    throw new Error(`정산 엑셀 조회 실패: ${uploadResult.error.code}`);
  }
  if (attachmentResult.error) {
    throw new Error(`정산 증빙 조회 실패: ${attachmentResult.error.code}`);
  }

  const uploads = await Promise.all(
    (uploadResult.data ?? []).map(async (upload) => ({
      id: upload.id,
      fileName: upload.original_filename,
      periodLabel: upload.settlement_months?.[0] ?? "기간 미확인",
      createdAt: upload.created_at,
      downloadUrl: await signedUrl(
        admin,
        "course-settlement-files",
        upload.storage_path,
      ),
    })),
  );
  const attachments = await Promise.all(
    (attachmentResult.data ?? []).map(async (attachment) => ({
      id: attachment.id,
      costId: attachment.cost_id,
      name: attachment.original_filename,
      type: attachment.mime_type,
      size: Number(attachment.file_size),
      url: await signedUrl(
        admin,
        "settlement-evidence",
        attachment.storage_path,
      ),
    })),
  );

  const { data: snapshotRows, error: snapshotError } = await admin
    .from("settlement_cost_snapshots")
    .select("cost_snapshot")
    .eq("settlement_id", settlement.id)
    .order("created_at");
  if (snapshotError) throw new Error(`정산 비용 스냅샷 조회 실패: ${snapshotError.code}`);
  const rawSnapshots = (snapshotRows ?? []).flatMap((row) => {
    const snapshot = row.cost_snapshot;
    return typeof snapshot === "object" && snapshot !== null ? [snapshot as CourseCost] : [];
  });
  const snapshots = await Promise.all(rawSnapshots.map(async (cost) => ({
    ...cost,
    attachments: await Promise.all((cost.attachments ?? []).map(async (file) => ({
      ...file,
      url: file.storagePath
        ? await signedUrl(admin, "course-cost-evidence", file.storagePath)
        : file.url ?? null,
    }))),
  })));
  const legacyDraft = sanitizeSettlementStatementDraft(settlement.statement_draft, "");
  const legacyConfirmed = Boolean(legacyDraft.confirmedAt);
  const legacyCosts = legacyDraft.costs.map((cost): CourseCost => {
    const companyShareAmount = cost.burden === "company" ? cost.amount : cost.burden === "shared" ? Math.round(cost.amount / 2) : 0;
    const instructorShareAmount = cost.amount - companyShareAmount;
    return {
      id: cost.id, courseId: settlement.course_id, categoryCode: "LEGACY", name: cost.name,
      burdenType: cost.burden === "company" ? "COMPANY" : cost.burden === "instructor" ? "INSTRUCTOR" : "SHARED",
      managerUserId: null, managerName: cost.manager, grossAmount: cost.amount, supplyAmount: cost.amount, vatAmount: 0,
      taxType: "REVIEW_REQUIRED", paidDate: cost.occurredOn, status: "PAID", evidenceRequired: cost.evidenceRequired, evidenceNeedsReview: cost.evidenceNeedsReview,
      evidenceTypes: [], otherEvidenceType: "", companyShareRate: cost.burden === "company" ? 100 : cost.burden === "shared" ? 50 : 0,
      instructorShareRate: cost.burden === "instructor" ? 100 : cost.burden === "shared" ? 50 : 0,
      companyShareAmount, instructorShareAmount, includeInSettlement: true, note: cost.note,
      migratedFrom: `legacy:${settlement.id}:${cost.id}`, version: 1, createdBy: "", createdAt: settlement.updated_at,
      updatedBy: "", updatedAt: settlement.updated_at,
      attachments: attachments.filter((file) => file.costId === cost.id).map((file) => ({
        id: file.id, originalName: file.name, mimeType: file.type, size: file.size, uploadedAt: settlement.updated_at, uploadedBy: "", storagePath: "", url: file.url,
      })),
    };
  });
  const currentCourseCosts = snapshots.length || legacyConfirmed
    ? []
    : await loadCourseCosts(admin, settlement.course_id);
  const courseCosts = snapshots.length
    ? snapshots
    : legacyConfirmed
      ? legacyCosts
      : currentCourseCosts;
  const appliedCourseCosts = snapshots.length
    ? snapshots
    : legacyConfirmed
      ? legacyCosts
      : filterSettlementCosts(currentCourseCosts, settlement.analysis_snapshot);

  return {
    settlementId: settlement.id,
    status: settlement.status,
    latestVersion: settlement.latest_version,
    updatedAt: settlement.updated_at,
    analysis: settlement.analysis_snapshot,
    draft: settlement.statement_draft,
    uploads,
    attachments,
    courseCosts,
    appliedCourseCosts,
    costsAreSnapshot: snapshots.length > 0 || legacyConfirmed,
  };
}

export function settlementError(error: unknown) {
  console.error("[course-settlement]", error);
  return Response.json({ message: error instanceof Error ? error.message : "정산 요청을 처리하지 못했습니다." }, { status: 400 });
}
