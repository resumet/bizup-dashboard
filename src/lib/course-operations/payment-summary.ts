import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CoursePaymentSummary = {
  id: string;
  name: string;
  free_webinar_at: string;
  instructor_name: string;
  cohort: string;
  nova_settled: boolean;
  instructor_settled: boolean;
  payment_count: number;
  payment_amount: number;
};

function isCompleted(status: string) {
  return status.normalize("NFKC").trim() === "결제완료";
}

export async function loadCoursePaymentSummaries(workspaceId: string) {
  const admin = createAdminClient();
  const { data: courses, error: courseError } = await admin
    .from("courses")
    .select("id,name,free_webinar_at,instructor_name,cohort,nova_settled,instructor_settled")
    .eq("workspace_id", workspaceId)
    .order("free_webinar_at", { ascending: false });
  if (courseError) {
    throw new Error(`전체 결제내역 강의 조회 실패 (${courseError.code}): ${courseError.message}`);
  }

  const summaries = new Map<string, { count: number; cents: number }>();
  const courseIds = (courses ?? []).map((course) => course.id);
  for (let offset = 0; courseIds.length && offset < 100000; offset += 1000) {
    const { data: orders, error: orderError } = await admin
      .from("course_orders")
      .select("course_id,current_amount,status")
      .in("course_id", courseIds)
      .range(offset, offset + 999);
    if (orderError) {
      throw new Error(`전체 결제내역 주문 조회 실패 (${orderError.code}): ${orderError.message}`);
    }
    for (const order of orders ?? []) {
      if (!isCompleted(order.status ?? "")) continue;
      const current = summaries.get(order.course_id) ?? { count: 0, cents: 0 };
      current.count += 1;
      current.cents += Math.round(Number(order.current_amount ?? 0) * 100);
      summaries.set(order.course_id, current);
    }
    if (!orders || orders.length < 1000) break;
  }

  return (courses ?? []).map((course) => {
    const totals = summaries.get(course.id) ?? { count: 0, cents: 0 };
    return {
      ...course,
      payment_count: totals.count,
      payment_amount: totals.cents / 100,
    } satisfies CoursePaymentSummary;
  });
}
