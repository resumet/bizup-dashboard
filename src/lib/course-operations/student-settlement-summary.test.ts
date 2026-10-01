import assert from "node:assert/strict";
import test from "node:test";

import { buildStudentSettlementCourseSummaries, totalStudentSettlementCourses } from "./student-settlement-summary";

test("웨비나 최신순으로 주문, 결제, 유료수강생, 비용을 집계한다", () => {
  const result = buildStudentSettlementCourseSummaries({
    courses: [
      {
        id: "older",
        name: "이전 강의",
        instructor_name: "강사 A",
        cohort: "1",
        free_webinar_at: "2026-08-01T10:00:00+09:00",
        nova_settled: true,
        instructor_settled: false,
      },
      {
        id: "newer",
        name: "최근 강의",
        instructor_name: "강사 B",
        cohort: "2",
        free_webinar_at: "2026-09-01T10:00:00+09:00",
        nova_settled: false,
        instructor_settled: true,
      },
    ],
    orders: [
      { course_id: "newer", current_amount: 100_000, status: "결제완료" },
      { course_id: "newer", current_amount: 50_000, status: "입금대기" },
      { course_id: "newer", current_amount: 20_000.25, status: " 결제완료 " },
    ],
    paidStudents: [
      { course_id: "newer", paid_student_count: 3 },
      { course_id: "newer", paid_student_count: 2 },
    ],
    costs: [
      { course_id: "newer", gross_amount: 30_000, status: "PAID" },
      { course_id: "newer", gross_amount: 10_000, status: "PLANNED" },
      { course_id: "newer", gross_amount: 5_000, status: "CANCELED" },
    ],
  });

  assert.deepEqual(result.map((item) => item.id), ["newer", "older"]);
  assert.deepEqual(result.map(({ nova_settled, instructor_settled }) => [nova_settled, instructor_settled]), [[false, true], [true, false]]);
  assert.deepEqual(
    {
      orderCount: result[0].order_count,
      paymentAmount: result[0].payment_amount,
      paidStudentCount: result[0].paid_student_count,
      totalCost: result[0].total_cost,
    },
    {
      orderCount: 3,
      paymentAmount: 120_000.25,
      paidStudentCount: 5,
      totalCost: 40_000,
    },
  );
  assert.deepEqual(totalStudentSettlementCourses(result), {
    order_count: 3, payment_amount: 120_000.25, paid_student_count: 5, total_cost: 40_000,
  });
});

test("전체 합계는 모든 강의를 더하고 금액 소수점 오차를 방지한다", () => {
  const course = {
    id: "a", name: "강의", instructor_name: "강사", cohort: "1", free_webinar_at: "2026-08-01",
    nova_settled: false, instructor_settled: false,
    order_count: 2, payment_amount: 0.1, paid_student_count: 1, total_cost: 0.2,
  };
  assert.deepEqual(totalStudentSettlementCourses([course, { ...course, id: "b", payment_amount: 0.2, total_cost: 0.1 }]), {
    order_count: 4, payment_amount: 0.3, paid_student_count: 2, total_cost: 0.3,
  });
  assert.deepEqual(totalStudentSettlementCourses([]), {
    order_count: 0, payment_amount: 0, paid_student_count: 0, total_cost: 0,
  });
});
