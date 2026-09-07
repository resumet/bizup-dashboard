import { calculateBurden, calculateTax, parseCourseCostInput } from "@/lib/course-costs/calculation";
import { authorizeCourseCosts, courseCostError, loadCourseCosts } from "@/lib/course-costs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ courseId: string; costId: string }> };
async function auth(params: Context["params"]) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) throw new Error("로그인이 필요합니다.");
  const ids = await params;
  return { user, ...ids, ...await authorizeCourseCosts(ids.courseId, user.id) };
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { admin, courseId, costId, user, locked } = await auth(params);
    if (locked) throw new Error("정산이 확정되어 비용을 수정할 수 없습니다.");
    const input = parseCourseCostInput(await request.json());
    const { data: before } = await admin.from("course_costs").select("*").eq("id", costId).eq("course_id", courseId).is("deleted_at", null).maybeSingle();
    if (!before) throw new Error("비용을 찾을 수 없습니다.");
    if (input.version !== before.version) throw new Error("다른 사용자가 비용을 수정했습니다. 새로고침 후 다시 시도해 주세요.");
    const tax = calculateTax(input.grossAmount, input.taxType);
    const burden = calculateBurden(input.grossAmount, input.burdenType, input.companyShareRate);
    const { data: updated, error } = await admin.from("course_costs").update({
      category_code: input.categoryCode, name: input.name, burden_type: input.burdenType, manager_user_id: input.managerUserId,
      manager_name: input.managerName, gross_amount: tax.grossAmount, supply_amount: tax.supplyAmount, vat_amount: tax.vatAmount,
      tax_type: input.taxType, paid_date: input.paidDate || null, status: input.status, evidence_required: input.evidenceRequired, evidence_needs_review: input.evidenceNeedsReview,
      evidence_types: input.evidenceTypes, other_evidence_type: input.otherEvidenceType, company_share_rate: burden.companyShareRate,
      instructor_share_rate: burden.instructorShareRate, company_share_amount: burden.companyShareAmount,
      instructor_share_amount: burden.instructorShareAmount, include_in_settlement: input.includeInSettlement, note: input.note,
      version: before.version + 1, updated_by: user.id, updated_at: new Date().toISOString(),
    }).eq("id", costId).eq("version", before.version).select("id").maybeSingle();
    if (error) throw new Error(`비용 수정 실패: ${error.code}`);
    if (!updated) throw new Error("다른 사용자가 비용을 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.");
    await admin.from("course_cost_audit_logs").insert({ course_cost_id: costId, course_id: courseId, actor_id: user.id, action: "UPDATED", before_data: before, after_data: input });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked: false });
  } catch (error) { return courseCostError(error); }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { admin, courseId, costId, user, locked } = await auth(params);
    if (locked) throw new Error("정산이 확정되어 비용을 삭제할 수 없습니다.");
    const { data: before } = await admin.from("course_costs").select("*").eq("id", costId).eq("course_id", courseId).is("deleted_at", null).maybeSingle();
    if (!before) throw new Error("비용을 찾을 수 없습니다.");
    const { data: deleted, error } = await admin.from("course_costs").update({ deleted_at: new Date().toISOString(), version: before.version + 1, updated_by: user.id }).eq("id", costId).eq("version", before.version).select("id").maybeSingle();
    if (error) throw new Error(`비용 삭제 실패: ${error.code}`);
    if (!deleted) throw new Error("다른 사용자가 비용을 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.");
    await admin.from("course_cost_audit_logs").insert({ course_cost_id: costId, course_id: courseId, actor_id: user.id, action: "DELETED", before_data: before });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked: false });
  } catch (error) { return courseCostError(error); }
}
