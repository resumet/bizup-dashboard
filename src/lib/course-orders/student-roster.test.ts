import assert from "node:assert/strict";
import test from "node:test";
import { createOrderStudentRoster } from "./student-roster";
import type { SavedCourseOrder } from "./types";

const order: SavedCourseOrder = {
  id: "order-1", updatedAt: "2026-09-15T00:00:00Z", productName: "강의 - 기본반",
  memberName: "김학생", phone: "01012345678", email: "student@example.com", optionName: "기본반",
  paymentAmount: 123456.78, refundAmount: 0, currentAmount: 123456.78, status: "결제완료",
  paymentMethod: "카드", rs: "", adMedia: "", inflowType: "", paymentId: "payment-1", orderId: "source-1", refundDate: "",
};

test("결제완료 주문만 포함하고 다섯 항목과 원본 금액·전화번호를 보존한다", () => {
  const statuses = ["결제완료", " 결제완료 ", "부분환불", "전액환불", "결제대기", "취소", "미결제완료", "결제완료 / 부분환불", ""];
  const rows = statuses.map((status, index) => ({ ...order, id: String(index), status }));
  assert.deepEqual(createOrderStudentRoster(rows), ["0", "1"].map((orderId) => ({
    orderId, name: "김학생", phone: "01012345678", email: "student@example.com", optionName: "기본반", amount: 123456.78,
  })));
  assert.equal(rows.length, statuses.length);
});

test("같은 사람의 다른 주문·옵션과 연락처가 없는 결제완료 주문도 누락하지 않는다", () => {
  const rows = createOrderStudentRoster([
    order, { ...order, id: "order-2", optionName: "심화반", paymentAmount: 200000 },
    { ...order, id: "order-3", memberName: "", phone: "", email: "", optionName: "", paymentAmount: 0 },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].optionName, "심화반");
  assert.equal(rows[1].amount, 200000);
  assert.equal(rows[2].phone, "");
  assert.equal(rows[2].amount, 0);
  assert.deepEqual(createOrderStudentRoster([]), []);
  assert.deepEqual(createOrderStudentRoster([{ ...order, status: "전액환불" }]), []);
});
