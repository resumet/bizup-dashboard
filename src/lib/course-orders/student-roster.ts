import type { SavedCourseOrder } from "./types";

export type OrderStudent = {
  orderId: string;
  name: string;
  phone: string;
  email: string;
  optionName: string;
  amount: number;
};

export function createOrderStudentRoster(orders: SavedCourseOrder[]): OrderStudent[] {
  return orders
    .filter((order) => order.status.normalize("NFKC").trim() === "결제완료")
    .map((order) => ({
      orderId: order.id,
      name: order.memberName,
      phone: order.phone,
      email: order.email,
      optionName: order.optionName,
      amount: order.paymentAmount,
    }));
}
