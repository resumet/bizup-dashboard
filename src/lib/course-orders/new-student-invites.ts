import type { RosterRow } from "@/lib/jobs/types";
import type { ReconcileOrder, RosterChange } from "./reconcile-roster";

export function selectNewStudentInvites(changes: RosterChange[], orders: ReconcileOrder[], rows: RosterRow[]) {
  const addedOrderIds = new Set(changes.filter(change => change.kind === "add").map(change => change.orderId));
  const keys = new Set(orders.filter(order => addedOrderIds.has(order.id)).map(order => order.record_key));
  return rows.filter(row => keys.has(row.values.orderRecordKey ?? "") && !row.groupChatJoined && !row.isExtraParticipant);
}
