import type { SavedCourseOrder } from "./types";

export type OrderStudent = {
  orderId: string;
  name: string;
  phone: string;
  email: string;
  optionName: string;
  inflowType: string;
  amount: number;
};

export function normalizeOrderStudentPhone(value: string) {
  const raw = value.normalize("NFKC").trim();
  if (!/^[+\d\s().-]+$/u.test(raw)) return "";
  let digits = raw.replace(/\D/gu, "");
  if (digits.startsWith("0082")) digits = digits.slice(4);
  else if (digits.startsWith("82")) digits = digits.slice(2);
  if (/^10\d{8}$/u.test(digits)) digits = `0${digits}`;
  return /^010\d{8}$/u.test(digits) ? digits : "";
}

export function formatOrderStudentPhone(value: string) {
  return normalizeOrderStudentPhone(value).replace(/^(010)(\d{4})(\d{4})$/u, "$1-$2-$3") || value.trim() || "—";
}

export function summarizeOrderStudents(students: OrderStudent[]) {
  const personKey = (student: OrderStudent) => {
    const phone = normalizeOrderStudentPhone(student.phone);
    return phone ? `phone:${phone}` : student.email.trim() ? `email:${student.email.trim().toLowerCase()}` : `order:${student.orderId}`;
  };
  const totalCents = students.reduce((sum, student) => sum + Math.round(student.amount * 100), 0);
  const groups = new Map<string, { people: Set<string>; count: number; cents: number }>();
  for (const student of students) {
    const group = groups.get(student.optionName) ?? { people: new Set<string>(), count: 0, cents: 0 };
    group.people.add(personKey(student)); group.count++; group.cents += Math.round(student.amount * 100);
    groups.set(student.optionName, group);
  }
  return {
    people: new Set(students.map(personKey)).size, count: students.length, amount: totalCents / 100,
    options: [...groups].map(([optionName, group]) => ({
      optionName, people: group.people.size, count: group.count, amount: group.cents / 100,
      contribution: totalCents > 0 ? group.cents / totalCents * 100 : null,
    })).sort((a, b) => b.amount - a.amount || a.optionName.localeCompare(b.optionName, "ko-KR")),
  };
}

export function createOrderStudentRoster(orders: SavedCourseOrder[]): OrderStudent[] {
  return orders
    .filter((order) => order.status.normalize("NFKC").trim() === "결제완료")
    .map((order) => ({
      orderId: order.id,
      name: order.memberName,
      phone: order.phone,
      email: order.email,
      optionName: order.optionName,
      inflowType: order.inflowType,
      amount: order.paymentAmount,
    }));
}
