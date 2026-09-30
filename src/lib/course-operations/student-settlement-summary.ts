export type StudentSettlementCourseSource = {
  id: string;
  name: string;
  instructor_name: string;
  cohort: string;
  free_webinar_at: string;
};

export type StudentSettlementOrderSource = {
  course_id: string;
  current_amount: number | string | null;
  status: string | null;
};

export type StudentSettlementCostSource = {
  course_id: string;
  gross_amount: number | string | null;
  status: string | null;
};

export type StudentSettlementPaidStudentSource = {
  course_id: string;
  paid_student_count: number;
};

export type StudentSettlementCourseSummary = StudentSettlementCourseSource & {
  order_count: number;
  payment_amount: number;
  paid_student_count: number;
  total_cost: number;
};

function isCompletedOrder(status: string | null) {
  return status?.normalize("NFKC").trim() === "결제완료";
}

export function buildStudentSettlementCourseSummaries({
  courses,
  orders,
  paidStudents,
  costs,
}: {
  courses: StudentSettlementCourseSource[];
  orders: StudentSettlementOrderSource[];
  paidStudents: StudentSettlementPaidStudentSource[];
  costs: StudentSettlementCostSource[];
}): StudentSettlementCourseSummary[] {
  const ordersByCourse = new Map<string, { count: number; paymentCents: number }>();
  for (const order of orders) {
    const summary = ordersByCourse.get(order.course_id) ?? {
      count: 0,
      paymentCents: 0,
    };
    summary.count += 1;
    if (isCompletedOrder(order.status)) {
      summary.paymentCents += Math.round(Number(order.current_amount ?? 0) * 100);
    }
    ordersByCourse.set(order.course_id, summary);
  }

  const paidStudentsByCourse = new Map<string, number>();
  for (const summary of paidStudents) {
    paidStudentsByCourse.set(
      summary.course_id,
      (paidStudentsByCourse.get(summary.course_id) ?? 0) +
        summary.paid_student_count,
    );
  }

  const costsByCourse = new Map<string, number>();
  for (const cost of costs) {
    if (cost.status === "CANCELED") continue;
    costsByCourse.set(
      cost.course_id,
      (costsByCourse.get(cost.course_id) ?? 0) +
        Number(cost.gross_amount ?? 0),
    );
  }

  return courses
    .map((course) => {
      const orderSummary = ordersByCourse.get(course.id);
      return {
        ...course,
        order_count: orderSummary?.count ?? 0,
        payment_amount: (orderSummary?.paymentCents ?? 0) / 100,
        paid_student_count: paidStudentsByCourse.get(course.id) ?? 0,
        total_cost: costsByCourse.get(course.id) ?? 0,
      };
    })
    .sort(
      (left, right) =>
        right.free_webinar_at.localeCompare(left.free_webinar_at) ||
        left.name.localeCompare(right.name, "ko-KR"),
    );
}
