/** Pure reconciliation planning. No writes occur until the selected changes are applied. */
export type ReconcileOrder = {
  id: string; record_key: string; member_name: string; phone: string; email: string;
  status: string; current_amount: number; refund_amount: number; payment_amount: number; option_name: string;
};
export type ReconcileEnrollment = {
  id: string; source_row_number: number; normalized_phone: string | null;
  normalized_values: Record<string, unknown>; original_values: Record<string, unknown>;
  student_id: string | null; is_extra_participant: boolean; is_manually_added: boolean;
};
export type RosterSnapshot = {
  courseName: string; jobId: string | null; version: number;
  orders: ReconcileOrder[]; enrollments: ReconcileEnrollment[];
};
export type RosterChange = {
  id: string; kind: "add" | "update" | "merge"; orderId: string;
  targetId: string | null; removeIds: string[]; name: string; phone: string;
  reason: string; before: { optionName: string; paymentAmount: number } | null;
  after: { optionName: string; paymentAmount: number };
};
export type RosterPlan = { changes: RosterChange[]; conflicts: { name: string; reason: string }[]; unchangedCount: number };
export type RosterPreview = RosterPlan & { token: string };

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
const fullyRefunded = (order: ReconcileOrder) => normalize(order.status).includes("환불") && Number(order.current_amount) === 0;
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
  for (const order of snapshot.orders.filter(completed)) {
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
  for (const order of snapshot.orders.filter(o => selected.has(o.id) && completed(o))) {
    const person = orderIdentity(order);
    const samePerson = person ? byIdentity.get(person) ?? [] : [];
    const exact = byKey.get(order.record_key);
    const refunded = samePerson.filter(row => {
      const source = ordersByKey.get(text(row.normalized_values.orderRecordKey));
      return source && fullyRefunded(source);
    });
    let target = exact;
    let removeIds: string[] = [];
    let reason = "같은 주문의 결제금액 또는 옵션명이 변경되었습니다.";
    if (refunded.length) {
      if (refunded.length !== 1 || activeCounts.get(person) !== 1 || text(refunded[0].normalized_values.refundedAt)) {
        plan.conflicts.push({ name: order.member_name, reason: "같은 결제자의 환불·결제 주문이 여러 건이라 연결할 기존 수강생을 확정할 수 없습니다. 명단에서 직접 확인해 주세요." });
        continue;
      }
      target = refunded[0];
      reason = "같은 결제자(이름·연락처)의 기존 주문이 전액환불되고 새 주문이 결제완료되어, 기존 수강생의 금액과 옵션을 갱신합니다.";
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
  return plan;
}
