import type { CourseOrder, CourseOrderFilters } from "./types";

export function isAwaitingDeposit(order: Pick<CourseOrder, "status">) {
  // Split payments can combine statuses, e.g. "결제완료 / 입금대기".
  return order.status.normalize("NFKC").split("/").some((status) => status.replace(/\s/gu, "") === "입금대기");
}

export function filterCourseOrders<T extends CourseOrder>(rows: T[], filters: CourseOrderFilters): T[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase("ko-KR");
  const inRange = (value: number, min: string, max: string) =>
    (!min || value >= Number(min)) && (!max || value <= Number(max));
  return rows.filter((row) => {
    const refunded = row.refundAmount !== 0 || Boolean(row.refundDate);
    return (!keyword || [row.productName, row.optionName, row.memberName, row.phone, row.email, row.paymentId, row.orderId, row.rs, row.status, row.paymentMethod, row.adMedia, row.inflowType]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(keyword))) &&
      Object.entries(filters.categories).every(([key, value]) => value === undefined || row[key as keyof CourseOrder] === value) &&
      (filters.refund === "all" || (filters.refund === "refunded" ? refunded : !refunded)) &&
      (!filters.refundFrom || (Boolean(row.refundDate) && row.refundDate >= filters.refundFrom)) &&
      (!filters.refundTo || (Boolean(row.refundDate) && row.refundDate <= filters.refundTo)) &&
      inRange(row.paymentAmount, filters.paymentMin, filters.paymentMax) &&
      inRange(row.refundAmount, filters.refundMin, filters.refundMax) &&
      inRange(row.currentAmount, filters.currentMin, filters.currentMax);
  });
}

export function summarizeCourseOrders(rows: CourseOrder[]) {
  return rows.reduce((sum, row) => ({
    count: sum.count + 1,
    paymentAmount: sum.paymentAmount + row.paymentAmount,
    refundAmount: sum.refundAmount + row.refundAmount,
    currentAmount: sum.currentAmount + row.currentAmount,
  }), { count: 0, paymentAmount: 0, refundAmount: 0, currentAmount: 0 });
}

export function summarizeCourseOrderOverview(rows: CourseOrder[]) {
  const summary = { count: rows.length, completedCount: 0, awaitingDepositCount: 0, refundedCount: 0,
    currentAmount: 0, awaitingDepositAmount: 0, refundAmount: 0 };
  // Sum in cents so decimal amounts do not accumulate floating-point error.
  for (const row of rows) {
    const statuses = row.status.normalize("NFKC").split("/").map((status) => status.replace(/\s/gu, ""));
    if (statuses.length === 1 && statuses[0] === "결제완료") summary.completedCount += 1;
    if (isAwaitingDeposit(row)) {
      summary.awaitingDepositCount += 1;
      summary.awaitingDepositAmount += Math.round(row.paymentAmount * 100);
    }
    if (row.refundAmount !== 0 || row.refundDate || statuses.some((status) => ["환불", "환불완료", "전액환불", "부분환불"].includes(status))) {
      summary.refundedCount += 1;
    }
    summary.currentAmount += Math.round(row.currentAmount * 100);
    summary.refundAmount += Math.round(row.refundAmount * 100);
  }
  summary.currentAmount /= 100;
  summary.awaitingDepositAmount /= 100;
  summary.refundAmount /= 100;
  return summary;
}
