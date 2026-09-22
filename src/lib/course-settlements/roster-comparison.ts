import type { SavedCourseOrder } from "@/lib/course-orders/types";
import { isUnpaidVirtualAccount } from "@/lib/course-orders/filter";
import type { MonthlyAnalysis } from "./engine";

export type ComparisonEntry = {
  paymentId: string;
  name: string; phone: string; email: string; source: string; description: string;
  payment: number; refund: number; net: number;
};
export const comparisonLabels = {
  "orders-only": "주문에만 있음", "settlement-only": "정산에만 있음",
  different: "금액 차이", review: "확인 필요", matched: "합계 일치",
} as const;
export type ComparisonStatus = keyof typeof comparisonLabels;
export type ComparisonGroup = {
  paymentId: string;
  name: string; orders: ComparisonEntry[]; settlements: ComparisonEntry[]; status: ComparisonStatus;
  orderTotal: ReturnType<typeof totals>; settlementTotal: ReturnType<typeof totals>;
};
function totals(rows: ComparisonEntry[]) {
  return rows.reduce((sum, row) => ({ payment: sum.payment + row.payment, refund: sum.refund + row.refund, net: sum.net + row.net }), { payment: 0, refund: 0, net: 0 });
}
function contacts(rows: ComparisonEntry[], field: "phone" | "email") {
  return new Set(rows.map(row => field === "phone" ? row.phone.replace(/\D/g, "") : row.email.trim().toLowerCase()).filter(Boolean));
}
export function compareSettlementRoster(orders: SavedCourseOrder[], months: MonthlyAnalysis[], instructor: string): ComparisonGroup[] {
  const eligible = orders.filter(row => !isUnpaidVirtualAccount(row));
  // Saved split orders contain several IDs and one combined amount. Join their IDs
  // into a component, but add that amount only once, never once per ID.
  const parents = new Map<string, string>();
  const ids = (value: string) => value.split(" / ").map(id => id.trim()).filter(Boolean);
  function root(id: string): string {
    const parent = parents.get(id);
    if (!parent || parent === id) return id;
    const result = root(parent); parents.set(id, result); return result;
  }
  for (const row of eligible) {
    const keys = ids(row.paymentId);
    for (const id of keys.slice(1)) parents.set(root(id), root(keys[0]));
  }
  const groups = new Map<string, { paymentId: string; name: string; orders: ComparisonEntry[]; settlements: ComparisonEntry[] }>();
  let unnamed = 0;
  function add(side: "orders" | "settlements", entry: ComparisonEntry) {
    const key = entry.paymentId.trim() ? root(ids(entry.paymentId)[0]) : `\0${side}:${unnamed++}`;
    const group = groups.get(key) ?? { paymentId: entry.paymentId.trim(), name: entry.name.trim() || "이름 없음", orders: [], settlements: [] };
    group[side].push(entry);
    groups.set(key, group);
  }
  for (const row of eligible) add("orders", { paymentId: row.paymentId, name: row.memberName, phone: row.phone, email: row.email,
    source: row.orderId || row.paymentId || row.id, description: [row.productName, row.optionName, row.status, row.paymentMethod].filter(Boolean).join(" · "),
    payment: row.paymentAmount, refund: row.refundAmount, net: row.currentAmount });
  for (const month of months) {
    const details = month.detailsByInstructor[instructor];
    if (!details) continue;
    for (const row of details.toss) add("settlements", { paymentId: row.buyerId ?? "", name: row.buyer, phone: "", email: "", source: `${month.periodLabel} · ${month.fileName}`, description: ["토스", row.date, row.status, row.paymentMethod].filter(Boolean).join(" · "), payment: Math.max(row.amount, 0), refund: Math.max(-row.amount, 0), net: row.amount });
    // Cash cancellations are already signed in the settlement engine.
    for (const row of details.cash) add("settlements", { paymentId: "", name: row.buyer, phone: row.phone, email: row.email, source: `${month.periodLabel} · ${month.fileName}`, description: ["무통장 · 구매자 ID 없음", row.date, row.lectureName].filter(Boolean).join(" · "), payment: row.paymentAmount, refund: -row.cancellationAmount, net: row.paymentAmount + row.cancellationAmount });
  }
  const rank: Record<ComparisonStatus, number> = { "orders-only": 0, "settlement-only": 1, different: 2, review: 3, matched: 4 };
  return [...groups.values()].map(group => {
    const orderTotal = totals(group.orders), settlementTotal = totals(group.settlements);
    let status: ComparisonStatus = "matched";
    if (!group.paymentId) status = "review";
    else if (!group.orders.length) status = "settlement-only";
    else if (!group.settlements.length) status = "orders-only";
    else if ((["payment", "refund", "net"] as const).some(key => orderTotal[key] !== settlementTotal[key])) status = "different";
    else if (contacts([...group.orders, ...group.settlements], "phone").size > 1 || contacts([...group.orders, ...group.settlements], "email").size > 1 || orderTotal.payment - orderTotal.refund !== orderTotal.net) status = "review";
    return { ...group, orderTotal, settlementTotal, status };
  }).sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "ko"));
}
