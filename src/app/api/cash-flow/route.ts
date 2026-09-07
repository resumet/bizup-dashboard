import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const inputSchema = z.object({
  currentBalance: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  monthlyFixedExpense: amount,
  plans: z.array(z.object({
    courseId: z.string().uuid(),
    expectedMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
    novaInflow: amount,
    instructorPayout: amount,
    isIncluded: z.boolean(),
  })).max(2_000),
});

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [membership, body] = await Promise.all([
      requireCourseOperationsMembership(user.id),
      request.json(),
    ]);
    const input = inputSchema.parse(body);
    const admin = createAdminClient();
    const courseIds = [...new Set(input.plans.map((plan) => plan.courseId))];
    const { data: courses, error: courseError } = courseIds.length
      ? await admin.from("courses").select("id").eq("workspace_id", membership.workspace_id).in("id", courseIds)
      : { data: [], error: null };
    if (courseError || (courses?.length ?? 0) !== courseIds.length) {
      throw new Error("워크스페이스에 속하지 않은 강의가 포함되어 있습니다.");
    }

    const { error: settingsError } = await admin.from("cash_flow_settings").upsert({
      workspace_id: membership.workspace_id,
      current_bank_balance: input.currentBalance,
      monthly_fixed_expense: input.monthlyFixedExpense,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });
    if (settingsError) throw new Error(`자금 설정 저장 실패: ${settingsError.code}`);

    if (input.plans.length) {
      const now = new Date().toISOString();
      const { error: planError } = await admin.from("cash_flow_course_plans").upsert(
        input.plans.map((plan) => ({
          workspace_id: membership.workspace_id,
          course_id: plan.courseId,
          expected_month: `${plan.expectedMonth}-01`,
          nova_inflow: plan.novaInflow,
          instructor_payout: plan.instructorPayout,
          is_included: plan.isIncluded,
          created_by: user.id,
          updated_by: user.id,
          updated_at: now,
        })),
        { onConflict: "workspace_id,course_id" },
      );
      if (planError) throw new Error(`강의별 자금 계획 저장 실패: ${planError.code}`);
    }

    return Response.json({ saved: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ message: "입력값을 확인해 주세요." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "자금 흐름을 저장하지 못했습니다.";
    if (message === "UNAUTHORIZED") {
      return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    return Response.json({ message }, { status: 400 });
  }
}
