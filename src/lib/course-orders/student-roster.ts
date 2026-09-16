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

export function maskOrderStudentPhone(value: string) {
  const raw = value.normalize("NFKC").trim();
  if (/^010-\*{4}-\d{4}$/u.test(raw)) return raw;
  const phone = normalizeOrderStudentPhone(value);
  return phone ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : raw ? "****" : "—";
}

export function maskOrderStudentEmail(value: string) {
  const email = value.normalize("NFKC").trim();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return email ? "****" : "—";
  return `${"*".repeat(Array.from(email.slice(0, at)).length)}${email.slice(at)}`;
}

export function maskOrderStudentName(value: string) {
  const name = value.normalize("NFKC").trim();
  const characters = Array.from(name);
  if (!characters.length) return "—";
  if (characters.length === 1) return "*";
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export function maskOrderStudentsForPublic(students: OrderStudent[]) {
  return students.map((student) => ({
    ...student,
    name: maskOrderStudentName(student.name),
    phone: maskOrderStudentPhone(student.phone),
    email: maskOrderStudentEmail(student.email),
  }));
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/u.test(text.trimStart())) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createOrderStudentCsv(students: OrderStudent[]) {
  const headers = ["번호", "이름", "전화번호", "이메일", "옵션명", "트래킹 유입구분", "결제금액"];
  const rows = students.map((student, index) => [
    index + 1,
    maskOrderStudentName(student.name),
    maskOrderStudentPhone(student.phone),
    maskOrderStudentEmail(student.email),
    student.optionName,
    student.inflowType,
    student.amount,
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function summarizeOrderStudents(students: OrderStudent[]) {
  const personKey = (student: OrderStudent) => {
    const phone = normalizeOrderStudentPhone(student.phone);
    return phone ? `phone:${phone}` : student.email.trim() ? `email:${student.email.trim().toLowerCase()}` : `order:${student.orderId}`;
  };
  const totalCents = students.reduce((sum, student) => sum + Math.round(student.amount * 100), 0);
  const groups = new Map<string, { people: Set<string>; count: number; cents: number }>();
  const inflowGroups = new Map<string, { people: Set<string>; count: number }>();
  for (const student of students) {
    const group = groups.get(student.optionName) ?? { people: new Set<string>(), count: 0, cents: 0 };
    group.people.add(personKey(student)); group.count++; group.cents += Math.round(student.amount * 100);
    groups.set(student.optionName, group);
    const inflowGroup = inflowGroups.get(student.inflowType) ?? { people: new Set<string>(), count: 0 };
    inflowGroup.people.add(personKey(student)); inflowGroup.count++;
    inflowGroups.set(student.inflowType, inflowGroup);
  }
  return {
    people: new Set(students.map(personKey)).size, count: students.length, amount: totalCents / 100,
    options: [...groups].map(([optionName, group]) => ({
      optionName, people: group.people.size, count: group.count, amount: group.cents / 100,
      contribution: totalCents > 0 ? group.cents / totalCents * 100 : null,
    })).sort((a, b) => b.amount - a.amount || a.optionName.localeCompare(b.optionName, "ko-KR")),
    inflowTypes: [...inflowGroups].map(([inflowType, group]) => ({
      inflowType, people: group.people.size, count: group.count,
    })).sort((a, b) => b.people - a.people || a.inflowType.localeCompare(b.inflowType, "ko-KR")),
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
