import "server-only";

import { calculateCostSettlement, normalizeName, type SettlementAnalysis, type SettlementCost } from "@/lib/course-settlements/engine";
import { sanitizeSettlementStatementDraft } from "@/lib/course-settlements/statement";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CashFlowCoursePlan, CashFlowDashboardData } from "./types";

type CourseRow = { id: string; name: string; instructor_name: string; starts_at: string };
type SettlementRow = { course_id: string; analysis_snapshot: unknown; statement_draft: unknown };

function koreaCurrentMonth() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthFromDate(value: string, fallback: string) {
  const match = /^(\d{4})-(\d{2})/u.exec(value);
  return match ? `${match[1]}-${match[2]}` : fallback;
}

function isSettlementAnalysis(value: unknown): value is SettlementAnalysis {
  return typeof value === "object" && value !== null && Array.isArray((value as SettlementAnalysis).instructorResults);
}

function toSettlementCost(cost: Record<string, unknown>): SettlementCost {
  const burden = cost.burden_type === "INSTRUCTOR" ? "instructor" : cost.burden_type === "SHARED" ? "shared" : "company";
  return {
    id: String(cost.id),
    name: String(cost.name ?? ""),
    burden,
    manager: String(cost.manager_name ?? ""),
    amount: Number(cost.gross_amount ?? 0),
    occurredOn: String(cost.paid_date ?? ""),
    note: "",
    evidenceRequired: false,
    evidenceType: "기타",
    evidenceNeedsReview: false,
    attachments: [],
    companyShareAmount: Number(cost.company_share_amount ?? 0),
    instructorShareAmount: Number(cost.instructor_share_amount ?? 0),
  };
}

export async function loadCashFlowDashboard(workspaceId: string): Promise<CashFlowDashboardData> {
  const admin = createAdminClient();
  const currentMonth = koreaCurrentMonth();
  const { data: courses, error: courseError } = await admin
    .from("courses")
    .select("id,name,instructor_name,starts_at")
    .eq("workspace_id", workspaceId)
    .order("starts_at");
  if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
  const courseRows = (courses ?? []) as CourseRow[];
  const courseIds = courseRows.map((course) => course.id);

  const [settingsResult, planResult, settlementResult, costResult] = await Promise.all([
    admin.from("cash_flow_settings").select("current_bank_balance,monthly_fixed_expense").eq("workspace_id", workspaceId).maybeSingle(),
    admin.from("cash_flow_course_plans").select("course_id,expected_month,nova_inflow,instructor_payout,is_included").eq("workspace_id", workspaceId),
    courseIds.length
      ? admin.from("course_settlement_projects").select("course_id,analysis_snapshot,statement_draft").eq("workspace_id", workspaceId).in("course_id", courseIds)
      : Promise.resolve({ data: [], error: null }),
    courseIds.length
      ? admin.from("course_costs").select("id,course_id,name,burden_type,manager_name,gross_amount,paid_date,status,include_in_settlement,company_share_amount,instructor_share_amount").in("course_id", courseIds).is("deleted_at", null).eq("status", "PAID").eq("include_in_settlement", true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const migrationError = [settingsResult.error, planResult.error].find((error) => error);
  if (migrationError && /PGRST20[45]|42P01/u.test(migrationError.code)) {
    return { currentMonth, currentBalance: 0, monthlyFixedExpense: 0, plans: [], loadError: "자금 흐름 DB 마이그레이션(202609030007)을 먼저 적용해 주세요." };
  }
  if (migrationError) throw new Error(`자금 설정 조회 실패: ${migrationError.code}`);
  if (settlementResult.error) throw new Error(`정산 조회 실패: ${settlementResult.error.code}`);
  if (costResult.error) throw new Error(`비용 조회 실패: ${costResult.error.code}`);

  const savedPlans = new Map((planResult.data ?? []).map((plan) => [plan.course_id as string, plan]));
  const settlements = new Map(((settlementResult.data ?? []) as SettlementRow[]).map((row) => [row.course_id, row]));
  const costsByCourse = new Map<string, SettlementCost[]>();
  for (const rawCost of costResult.data ?? []) {
    const courseId = String(rawCost.course_id);
    const costs = costsByCourse.get(courseId) ?? [];
    costs.push(toSettlementCost(rawCost));
    costsByCourse.set(courseId, costs);
  }

  const plans: CashFlowCoursePlan[] = courseRows.map((course) => {
    const settlement = settlements.get(course.id);
    const analysis = settlement && isSettlementAnalysis(settlement.analysis_snapshot) ? settlement.analysis_snapshot : null;
    const instructor = analysis?.instructorResults.find((item) => normalizeName(item.instructor) === normalizeName(course.instructor_name)) ?? null;
    const draft = sanitizeSettlementStatementDraft(settlement?.statement_draft, course.name);
    const autoInstructorPayout = instructor
      ? Math.max(0, calculateCostSettlement({
          totalSales: instructor.totalSales,
          pgFee: instructor.pgFee,
          novaFee: instructor.systemNovaFee,
          costs: costsByCourse.get(course.id) ?? [],
          instructorRatioPercent: draft.instructorRatioPercent,
        }).instructorFinal)
      : 0;
    const autoNovaInflow = instructor ? Math.max(0, Math.round(instructor.settlementAmount)) : 0;
    const saved = savedPlans.get(course.id);
    return {
      courseId: course.id,
      courseName: course.name,
      instructorName: course.instructor_name,
      expectedMonth: saved ? String(saved.expected_month).slice(0, 7) : monthFromDate(course.starts_at, currentMonth),
      novaInflow: saved ? Number(saved.nova_inflow) : autoNovaInflow,
      instructorPayout: saved ? Number(saved.instructor_payout) : autoInstructorPayout,
      isIncluded: saved ? Boolean(saved.is_included) : true,
      autoNovaInflow,
      autoInstructorPayout,
      hasSettlement: Boolean(instructor),
    };
  });

  return {
    currentMonth,
    currentBalance: Number(settingsResult.data?.current_bank_balance ?? 0),
    monthlyFixedExpense: Number(settingsResult.data?.monthly_fixed_expense ?? 0),
    plans,
  };
}
