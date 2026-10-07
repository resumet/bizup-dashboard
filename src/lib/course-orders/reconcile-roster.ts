/** Pure reconciliation planning. No writes occur until the selected changes are applied. */
import { isPaymentBeforeWebinar } from "./eligibility";

export type ReconcileOrder = {
  id: string; record_key: string; member_name: string; phone: string; email: string;
  status: string; current_amount: number; refund_amount: number; payment_amount: number; option_name: string;
  payment_date: string | null;
};
export type ReconcileEnrollment = {
  id: string; source_row_number: number; normalized_phone: string | null;
  normalized_values: Record<string, unknown>; original_values: Record<string, unknown>;
  student_id: string | null; is_extra_participant: boolean; is_manually_added: boolean;
};
export type RosterSnapshot = {
  courseName: string; webinarDate: string; jobId: string | null; version: number;
  orders: ReconcileOrder[]; enrollments: ReconcileEnrollment[];
};
export type RosterChange = {
  id: string; kind: "add" | "update" | "merge" | "remove"; orderId: string | null;
  targetId: string | null; removeIds: string[]; name: string; phone: string;
  reason: string; before: { optionName: string; paymentAmount: number } | null;
  after: { optionName: string; paymentAmount: number };
  exclusionReason?: "refund" | "partial_refund" | "before_webinar" | "missing_order";
};
export type RosterPlan = { changes: RosterChange[]; conflicts: { name: string; reason: string }[]; unchangedCount: number };
export type RosterPreview = RosterPlan & { token: string };
export type AutomaticRosterSyncPlan = {
  changes: RosterChange[];
  reviewRequiredCount: number;
  beforeWebinarExcludedCount: number;
};

const text = (value: unknown) => typeof value === "string" ? value : "";
const normalize = (value: string) => value.normalize("NFKC").replace(/\s/gu, "").toLowerCase();
function phone(value: string) {
  let digits = value.normalize("NFKC").replace(/\D/gu, "").replace(/^(0082|82)/u, "");
  if (digits.startsWith("10")) digits = `0${digits}`;
  return /^01[016789]\d{7,8}$/u.test(digits) ? digits : "";
}
function identity(name: string, number: string, email: string) {
  const contact = phone(number) || normalize(email);
  return contact && normalize(name) ? `${normalize(name)}|${contact}` : "";
}
const completed = (order: ReconcileOrder) => normalize(order.status) === "결제완료";
const fullyRefunded = (order: ReconcileOrder) => /취소|환불/u.test(normalize(order.status)) && Number(order.current_amount) === 0;
const partiallyRefunded = (order: ReconcileOrder) => normalize(order.status) === "부분환불";
export const isRosterEligibleOrder = (snapshot: Pick<RosterSnapshot, "webinarDate">, order: ReconcileOrder) =>
  completed(order) && !isPaymentBeforeWebinar(order.payment_date, snapshot.webinarDate);
const amount = (value: unknown) => Number(text(value).replace(/,/gu, "") || value || 0);

// A duplicate with its own operator edits needs manual review, never silent deletion.
function duplicateHasEdits(row: ReconcileEnrollment, keep: ReconcileEnrollment, order: ReconcileOrder) {
  const v = row.normalized_values, k = keep.normalized_values;
  if (row.student_id || row.is_extra_participant || row.is_manually_added) return true;
  if (v.groupChatJoined && !k.groupChatJoined) return true;
  if (text(v.memo) && v.memo !== k.memo) return true;
  if (v.hasDifferentStudent && (!k.hasDifferentStudent || v.studentName !== k.studentName || v.studentPhone !== k.studentPhone)) return true;
  if (text(v.refundedAt)) return true;
  return normalize(text(v.customerName)) !== normalize(order.member_name)
    || phone(text(v.phone)) !== phone(order.phone) || normalize(text(v.email)) !== normalize(order.email)
    || text(v.optionName) !== order.option_name || amount(v.paymentAmount) !== Number(order.payment_amount);
}

export function planPaidRoster(snapshot: RosterSnapshot, orderIds: string[]): RosterPlan {
  const plan: RosterPlan = { changes: [], conflicts: [], unchangedCount: 0 };
  const ordersByKey = new Map(snapshot.orders.map(o => [o.record_key, o]));
  const orderIdentity = (o: ReconcileOrder) => identity(o.member_name, o.phone, o.email);
  const rowIdentity = (r: ReconcileEnrollment) => {
    // Match the payer of the original order, not the linked actual student's contact.
    const original = ordersByKey.get(text(r.normalized_values.orderRecordKey));
    return original ? orderIdentity(original) : identity(text(r.normalized_values.customerName), r.normalized_phone || text(r.normalized_values.phone), text(r.normalized_values.email));
  };
  const byIdentity = new Map<string, ReconcileEnrollment[]>();
  const byKey = new Map<string, ReconcileEnrollment>();
  const activeCounts = new Map<string, number>();
  for (const order of snapshot.orders.filter((item) => isRosterEligibleOrder(snapshot, item))) {
    const person = orderIdentity(order);
    if (person) activeCounts.set(person, (activeCounts.get(person) ?? 0) + 1);
  }
  for (const row of snapshot.enrollments) {
    const key = text(row.normalized_values.orderRecordKey);
    if (key) byKey.set(key, row);
    const person = rowIdentity(row);
    if (person) byIdentity.set(person, [...(byIdentity.get(person) ?? []), row]);
  }
  const selected = new Set(orderIds);
  const usedTargets = new Set<string>();
  for (const order of snapshot.orders.filter(o => selected.has(o.id) && isRosterEligibleOrder(snapshot, o))) {
    const person = orderIdentity(order);
    const samePerson = person ? byIdentity.get(person) ?? [] : [];
    const exact = byKey.get(order.record_key);
    const reusable = samePerson.filter(row => {
      const source = ordersByKey.get(text(row.normalized_values.orderRecordKey));
      return Boolean(text(row.normalized_values.refundedAt))
        || Boolean(source && (fullyRefunded(source) || partiallyRefunded(source)));
    });
    let target = exact;
    let removeIds: string[] = [];
    let reason = "같은 주문의 결제금액 또는 옵션명이 변경되었습니다.";
    if (reusable.length) {
      if (reusable.length !== 1 || activeCounts.get(person) !== 1) {
        plan.conflicts.push({ name: order.member_name, reason: "같은 결제자의 환불·결제 주문이 여러 건이라 연결할 기존 수강생을 확정할 수 없습니다. 명단에서 직접 확인해 주세요." });
        continue;
      }
      target = reusable[0];
      reason = text(target.normalized_values.refundedAt)
        ? "환불자 목록에 보관된 결제자가 다시 결제하여, 기존 수강생의 참여 이력과 정보를 유지한 채 활성 명단으로 복원합니다."
        : "같은 결제자(이름·연락처)의 기존 주문이 취소·전액환불되고 새 주문이 결제완료되어, 기존 수강생의 금액과 옵션을 갱신합니다.";
      if (exact && exact.id !== target.id) {
        if (duplicateHasEdits(exact, target, order)) {
          plan.conflicts.push({ name: order.member_name, reason: "재결제로 추가된 중복 명단에도 별도로 수정한 정보가 있어 자동으로 합칠 수 없습니다. 두 명단의 참여 이력과 수강생 정보를 확인해 주세요." });
          continue;
        }
        removeIds = [exact.id];
        reason += " 재결제로 추가된 중복 1건을 정리하고 환불 전부터 있던 명단의 참여 이력과 연결 수강생 정보를 유지합니다.";
      }
    } else if (!exact && samePerson.length) {
      // Missing old source orders and manual rows cannot safely be assumed to be a repurchase.
      const uncertain = samePerson.some(row => !ordersByKey.has(text(row.normalized_values.orderRecordKey)));
      if (uncertain) {
        plan.conflicts.push({ name: order.member_name, reason: "같은 이름·연락처의 기존 수강생이 있지만 원래 주문의 환불 여부를 확인할 수 없습니다. 중복 추가를 보류했습니다." });
        continue;
      }
    }
    if (target && usedTargets.has(target.id)) {
      plan.conflicts.push({ name: order.member_name, reason: "여러 주문이 같은 수강생에 연결되어 자동 반영을 보류했습니다." });
      continue;
    }
    if (target) usedTargets.add(target.id);
    const before = target ? { optionName: text(target.normalized_values.optionName), paymentAmount: amount(target.normalized_values.paymentAmount) } : null;
    const after = { optionName: order.option_name, paymentAmount: Number(order.payment_amount) };
    if (target && !removeIds.length && target.normalized_values.orderRecordKey === order.record_key
      && before!.optionName === after.optionName && before!.paymentAmount === after.paymentAmount) {
      plan.unchangedCount++;
      continue;
    }
    plan.changes.push({
      id: order.id, orderId: order.id, targetId: target?.id ?? null, removeIds,
      kind: removeIds.length ? "merge" : target ? "update" : "add",
      name: target ? text(target.normalized_values.customerName) : order.member_name,
      phone: target ? target.normalized_phone ?? "" : phone(order.phone),
      reason: target ? reason : "결제완료된 신규 주문을 유료수강생 명단에 추가합니다.", before, after,
    });
  }
  const mergedIds = new Set(plan.changes.flatMap(change => change.removeIds));
  for (const row of snapshot.enrollments) {
    const key = text(row.normalized_values.orderRecordKey);
    if (!key || row.is_manually_added || text(row.normalized_values.refundedAt) || usedTargets.has(row.id) || mergedIds.has(row.id)) continue;
    const source = ordersByKey.get(key);
    const refunded = source && (fullyRefunded(source) || partiallyRefunded(source));
    const beforeWebinar = source && isPaymentBeforeWebinar(source.payment_date, snapshot.webinarDate);
    if (source && !refunded && !beforeWebinar) continue;
    // A repurchase or ambiguous matching must be resolved before removing the old entry.
    if ((activeCounts.get(rowIdentity(row)) ?? 0) > 0) continue;
    const before = { optionName: text(row.normalized_values.optionName), paymentAmount: amount(row.normalized_values.paymentAmount) };
    plan.changes.push({
      id: row.id, kind: "remove", orderId: source?.id ?? null, targetId: row.id, removeIds: [],
      name: text(row.normalized_values.customerName), phone: row.normalized_phone ?? "",
      exclusionReason: beforeWebinar
        ? "before_webinar"
        : source && partiallyRefunded(source)
          ? "partial_refund"
          : source ? "refund" : "missing_order",
      reason: beforeWebinar
        ? `결제일 ${source!.payment_date}이 웨비나일 ${snapshot.webinarDate}보다 이전입니다. 승인하면 현재 결제자 명단에서 제외합니다.`
        : source && partiallyRefunded(source)
          ? `주문상태가 '${source.status}'이고 현 결제금액은 ${Number(source.current_amount).toLocaleString("ko-KR")}원입니다. 승인하면 현재 명단에서 제외하고 환불자 목록에 보관합니다.`
          : source ? `주문상태가 '${source.status}'이고 잔여 결제금액이 0원입니다. 승인하면 현재 명단에서 제외하고 환불자 목록에 보관합니다.`
        : "연결된 주문이 최신 주문내역에서 없어졌습니다. 취소·환불 여부를 확인하고 승인하면 현재 명단에서 제외하여 환불자 목록에 보관합니다.",
      before, after: before,
    });
  }
  return plan;
}

/**
 * Plans the safe subset applied immediately after an order workbook refresh.
 * New payers still require the existing manual roster approval flow. Missing
 * source orders are also left for review because absence alone does not prove a
 * cancellation or full refund.
 */
export function planAutomaticPaidRosterSync(
  snapshot: RosterSnapshot,
): AutomaticRosterSyncPlan {
  const activeOrderIds = snapshot.orders
    .filter((order) => isRosterEligibleOrder(snapshot, order))
    .map((order) => order.id);
  const plan = planPaidRoster(snapshot, activeOrderIds);
  const ordersByKey = new Map(snapshot.orders.map((order) => [order.record_key, order]));
  const enrollmentsById = new Map(snapshot.enrollments.map((row) => [row.id, row]));
  let skippedRemovalCount = 0;
  const changes = plan.changes.filter((change) => {
    if (change.kind === "add") return false;
    if (change.kind !== "remove") return true;
    const target = change.targetId ? enrollmentsById.get(change.targetId) : null;
    const source = target
      ? ordersByKey.get(text(target.normalized_values.orderRecordKey))
      : null;
    if (source && (fullyRefunded(source)
      || partiallyRefunded(source)
      || isPaymentBeforeWebinar(source.payment_date, snapshot.webinarDate))) return true;
    skippedRemovalCount++;
    return false;
  });
  return {
    changes,
    reviewRequiredCount: plan.conflicts.length + skippedRemovalCount,
    beforeWebinarExcludedCount: snapshot.orders.filter((order) => completed(order)
      && isPaymentBeforeWebinar(order.payment_date, snapshot.webinarDate)).length,
  };
}
