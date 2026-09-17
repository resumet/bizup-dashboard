import assert from "node:assert/strict";
import test from "node:test";
import { selectNewStudentInvites } from "./new-student-invites";
import type { RosterRow } from "@/lib/jobs/types";
import type { ReconcileOrder, RosterChange } from "./reconcile-roster";

test("실제 반영된 신규 수강생만 초대하고 기존 변경·미선택·참여·별도 인원을 제외한다", () => {
  const orders: ReconcileOrder[] = ["new", "update", "unselected", "joined", "extra"].map(id => ({ id, record_key: `key-${id}`, member_name: id, phone: "01012345678", email: "", status: "결제완료", current_amount: 100, refund_amount: 0, payment_amount: 100, option_name: "기본반" }));
  const changes: RosterChange[] = orders.filter(order => order.id !== "unselected").map(order => ({ id: order.id, orderId: order.id, kind: order.id === "update" ? "update" : "add", targetId: null, removeIds: [], name: order.member_name, phone: order.phone, reason: "", before: null, after: { optionName: order.option_name, paymentAmount: 100 } }));
  const rows: RosterRow[] = orders.map(order => ({ id: order.id, sourceRowNumber: 1, normalizedPhone: order.phone, isDuplicate: false, groupChatJoined: order.id === "joined", isExtraParticipant: order.id === "extra", isManuallyAdded: false, memo: "", values: { customerName: order.member_name, phone: order.phone, courseName: "강의", optionName: "기본반", email: "", referrer: "", source: "", adMedia: "", orderRecordKey: order.record_key } }));
  assert.deepEqual(selectNewStudentInvites(changes, orders, rows).map(row => row.id), ["new"]);
  assert.deepEqual(selectNewStudentInvites([], orders, rows), []);
});
