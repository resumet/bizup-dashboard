import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCoursePaidStudentSummaries } from "./paid-student-summary";
import {
  buildStudentSettlementCourseSummaries,
  type StudentSettlementCostSource,
  type StudentSettlementOrderSource,
} from "./student-settlement-summary";

const PAGE_SIZE = 1_000;

export async function loadStudentSettlementCourseSummaries(
  workspaceId: string,
) {
  const admin = createAdminClient();
  const { data: courses, error: courseError } = await admin
    .from("courses")
    .select("id,name,instructor_name,cohort,free_webinar_at")
    .eq("workspace_id", workspaceId);
  if (courseError) {
    throw new Error(
      `수강생관리 강의 조회 실패 (${courseError.code}): ${courseError.message}`,
    );
  }

  const courseIds = (courses ?? []).map((course) => course.id);
  if (!courseIds.length) return [];

  const [orders, costs, paidStudents] = await Promise.all([
    loadPagedRows<StudentSettlementOrderSource>(async (offset) => {
      const result = await admin
        .from("course_orders")
        .select("course_id,current_amount,status")
        .in("course_id", courseIds)
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) {
        throw new Error(
          `주문 요약 조회 실패 (${result.error.code}): ${result.error.message}`,
        );
      }
      return result.data ?? [];
    }),
    loadPagedRows<StudentSettlementCostSource>(async (offset) => {
      const result = await admin
        .from("course_costs")
        .select("course_id,gross_amount,status")
        .in("course_id", courseIds)
        .is("deleted_at", null)
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) {
        throw new Error(
          `비용 요약 조회 실패 (${result.error.code}): ${result.error.message}`,
        );
      }
      return result.data ?? [];
    }),
    loadCoursePaidStudentSummaries(workspaceId),
  ]);

  return buildStudentSettlementCourseSummaries({
    courses: courses ?? [],
    orders,
    paidStudents,
    costs,
  });
}

async function loadPagedRows<Row>(
  loadPage: (offset: number) => Promise<Row[]>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 100_000; offset += PAGE_SIZE) {
    const page = await loadPage(offset);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
