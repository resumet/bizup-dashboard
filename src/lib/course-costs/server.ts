import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CourseCost, CourseCostAttachment, CourseCostAudit } from "./types";

export async function authorizeCourseCosts(courseId: string, userId: string) {
  const admin = createAdminClient();
  const { data: course, error } = await admin.from("courses").select("id,name,instructor_name,starts_at,workspace_id").eq("id", courseId).maybeSingle();
  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!course) throw new Error("강의를 찾을 수 없습니다.");
  const { data: membership } = await admin.from("workspace_members").select("role").eq("workspace_id", course.workspace_id).eq("user_id", userId).maybeSingle();
  if (!membership) throw new Error("비용을 관리할 권한이 없습니다.");
  const { data: confirmed } = await admin.from("course_settlement_projects").select("id").eq("course_id", courseId).eq("status", "정산확정").maybeSingle();
  return { admin, course, workspaceId: course.workspace_id as string, role: membership.role as string, locked: Boolean(confirmed) };
}

export async function loadCourseCosts(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
) {
  const { data: costs, error } = await admin
    .from("course_costs")
    .select("*")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw new Error(error.code === "PGRST205" ? "강의 비용 DB 마이그레이션을 먼저 적용해 주세요." : `비용 조회 실패: ${error.code}`);
  const costIds = (costs ?? []).map((item) => item.id as string);
  const { data: attachments, error: attachmentError } = costIds.length
    ? await admin.from("course_cost_attachments").select("*").in("course_cost_id", costIds)
    : { data: [], error: null };
  if (attachmentError) throw new Error(`비용 증빙 조회 실패: ${attachmentError.code}`);
  const attachmentItems = await Promise.all((attachments ?? []).map(async (item): Promise<CourseCostAttachment> => ({
    id: item.id,
    originalName: item.original_name,
    mimeType: item.mime_type,
    size: Number(item.file_size),
    uploadedAt: item.uploaded_at,
    uploadedBy: item.uploaded_by,
    storagePath: item.storage_path,
    url: (await admin.storage.from("course-cost-evidence").createSignedUrl(item.storage_path, 3600)).data?.signedUrl ?? null,
  })));
  const attachmentCostId = new Map((attachments ?? []).map((item) => [item.id as string, item.course_cost_id as string]));
  return (costs ?? []).map((item): CourseCost => ({
    id: item.id, courseId: item.course_id, categoryCode: item.category_code, name: item.name,
    burdenType: item.burden_type, managerUserId: item.manager_user_id, managerName: item.manager_name,
    grossAmount: Number(item.gross_amount), supplyAmount: Number(item.supply_amount), vatAmount: Number(item.vat_amount), taxType: item.tax_type,
    paidDate: item.paid_date ?? "", status: item.status, evidenceRequired: item.evidence_required, evidenceNeedsReview: item.evidence_needs_review,
    evidenceTypes: item.evidence_types ?? [], otherEvidenceType: item.other_evidence_type,
    companyShareRate: Number(item.company_share_rate), instructorShareRate: Number(item.instructor_share_rate),
    companyShareAmount: Number(item.company_share_amount), instructorShareAmount: Number(item.instructor_share_amount),
    includeInSettlement: item.include_in_settlement, note: item.note, migratedFrom: item.migrated_from,
    version: item.version, createdBy: item.created_by, createdAt: item.created_at, updatedBy: item.updated_by, updatedAt: item.updated_at,
    attachments: attachmentItems.filter((attachment) => attachmentCostId.get(attachment.id) === item.id),
  }));
}

export function filterSettlementCosts(costs: CourseCost[], _analysis?: unknown) {
  return costs.filter((cost) =>
    cost.status === "PAID" &&
    cost.includeInSettlement,
  );
}

export async function loadCourseCostAudit(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
): Promise<CourseCostAudit[]> {
  const { data, error } = await admin
    .from("course_cost_audit_logs")
    .select("id,course_cost_id,actor_id,action,created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`비용 변경 이력 조회 실패: ${error.code}`);
  const { data: costRows, error: costError } = await admin
    .from("course_costs")
    .select("id,name")
    .eq("course_id", courseId);
  if (costError) throw new Error(`비용명 조회 실패: ${costError.code}`);
  const costNames = new Map((costRows ?? []).map((cost) => [cost.id as string, cost.name as string]));
  const actorIds = [...new Set((data ?? []).flatMap((item) => item.actor_id ? [item.actor_id as string] : []))];
  const actors = new Map<string, string>();
  await Promise.all(actorIds.map(async (actorId) => {
    const { data: user } = await admin.auth.admin.getUserById(actorId);
    actors.set(actorId, user.user?.email ?? actorId);
  }));
  return (data ?? []).map((item) => ({
    id: Number(item.id),
    costName: costNames.get(item.course_cost_id as string) ?? "삭제된 비용",
    actorEmail: item.actor_id ? actors.get(item.actor_id as string) ?? String(item.actor_id) : "시스템",
    action: item.action as string,
    createdAt: item.created_at as string,
  }));
}

export function courseCostError(error: unknown) {
  return Response.json({ message: error instanceof Error ? error.message : "비용 요청을 처리하지 못했습니다." }, { status: 400 });
}
