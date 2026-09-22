import { calculateBurden, calculateTax, parseCourseCostInput } from "@/lib/course-costs/calculation";
import { authorizeCourseCosts, courseCostError, loadCourseCosts } from "@/lib/course-costs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ courseId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function context(params: Context["params"]) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) throw new Error("로그인이 필요합니다.");
  const { courseId } = await params;
  return { user, courseId, ...await authorizeCourseCosts(courseId, user.id) };
}

export async function GET(_: Request, { params }: Context) {
  try {
    const { admin, courseId, locked } = await context(params);
    return Response.json(
      { costs: await loadCourseCosts(admin, courseId), locked },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) { return courseCostError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { admin, courseId, workspaceId, user, locked } = await context(params);
    if (locked) throw new Error("정산이 확정되어 비용을 추가할 수 없습니다. 정산 확정 취소 후 변경해 주세요.");
    const input = parseCourseCostInput(await request.json());
    const tax = calculateTax(input.grossAmount, input.taxType);
    const burden = calculateBurden(input.grossAmount, input.burdenType, input.companyShareRate);
    const { data, error } = await admin.from("course_costs").insert({
      course_id: courseId, category_code: input.categoryCode, name: input.name, burden_type: input.burdenType,
      manager_user_id: input.managerUserId, manager_name: input.managerName, ...{ gross_amount: tax.grossAmount, supply_amount: tax.supplyAmount, vat_amount: tax.vatAmount },
      tax_type: input.taxType, paid_date: input.paidDate || null, status: input.status, evidence_required: input.evidenceRequired, evidence_needs_review: input.evidenceNeedsReview,
      evidence_types: input.evidenceTypes, other_evidence_type: input.otherEvidenceType,
      company_share_rate: burden.companyShareRate, instructor_share_rate: burden.instructorShareRate,
      company_share_amount: burden.companyShareAmount, instructor_share_amount: burden.instructorShareAmount,
      include_in_settlement: input.includeInSettlement, note: input.note, created_by: user.id, updated_by: user.id,
    }).select("id").single();
    if (error || !data) throw new Error(`비용 저장 실패: ${error?.code}`);
    await admin.from("course_cost_audit_logs").insert({ course_cost_id: data.id, course_id: courseId, actor_id: user.id, action: "CREATED", after_data: input });
    await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_id: user.id, event_type: "course_cost.created", entity_type: "course_cost", entity_id: data.id, metadata: { course_id: courseId } });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked: false }, { status: 201 });
  } catch (error) { return courseCostError(error); }
}

function databaseValues(value: unknown) {
  const input = parseCourseCostInput(value);
  const tax = calculateTax(input.grossAmount, input.taxType);
  const burden = calculateBurden(input.grossAmount, input.burdenType, input.companyShareRate);
  return {
    category_code: input.categoryCode,
    name: input.name,
    burden_type: input.burdenType,
    manager_user_id: input.managerUserId,
    manager_name: input.managerName,
    gross_amount: tax.grossAmount,
    supply_amount: tax.supplyAmount,
    vat_amount: tax.vatAmount,
    paid_date: input.paidDate || null,
    status: input.status,
    company_share_rate: burden.companyShareRate,
    instructor_share_rate: burden.instructorShareRate,
    company_share_amount: burden.companyShareAmount,
    instructor_share_amount: burden.instructorShareAmount,
  };
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { admin, courseId, workspaceId, user, locked } = await context(params);
    const body = await request.json() as { creates?: unknown; updates?: unknown; deletes?: unknown };
    const rawCreates = Array.isArray(body.creates) ? body.creates : [];
    const rawUpdates = Array.isArray(body.updates) ? body.updates : [];
    const rawDeletes = Array.isArray(body.deletes) ? body.deletes : [];
    if (rawCreates.length + rawUpdates.length + rawDeletes.length > 500) {
      throw new Error("한 번에 저장할 수 있는 비용 변경은 최대 500건입니다.");
    }
    const creates = rawCreates.map(databaseValues);
    const updates = rawUpdates.map((raw) => {
      const item = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
      const id = typeof item.id === "string" ? item.id : "";
      const version = Number(item.version);
      if (!UUID_PATTERN.test(id) || !Number.isSafeInteger(version) || version < 1) {
        throw new Error("수정할 비용 정보가 올바르지 않습니다.");
      }
      return { id, version, ...databaseValues(item.input) };
    });
    const deletes = rawDeletes.map((raw) => {
      const item = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
      const id = typeof item.id === "string" ? item.id : "";
      const version = Number(item.version);
      if (!UUID_PATTERN.test(id) || !Number.isSafeInteger(version) || version < 1) {
        throw new Error("삭제할 비용 정보가 올바르지 않습니다.");
      }
      return { id, version };
    });
    if (!creates.length && !updates.length && !deletes.length) {
      return Response.json({ costs: await loadCourseCosts(admin, courseId), locked });
    }
    const { error } = await admin.rpc("save_course_cost_changes_and_reset_settlement", {
      p_course_id: courseId,
      p_actor_id: user.id,
      p_changes: { creates, updates, deletes },
    });
    if (error) throw new Error(`비용 일괄 저장 실패: ${error.message}`);
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_cost.bulk_saved",
      entity_type: "course",
      entity_id: courseId,
      metadata: { created: creates.length, updated: updates.length, deleted: deletes.length },
    });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked: false });
  } catch (error) { return courseCostError(error); }
}
