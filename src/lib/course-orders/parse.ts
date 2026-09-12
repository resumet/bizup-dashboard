import type { CourseOrder, CourseOrderPreview } from "./types";

export const COURSE_ORDER_HEADERS = [
  "주문항목명", "회원명", "휴대전화번호", "이메일", "결제금액", "환불금액",
  "현 결제금액", "주문상태", "결제방법", "RS", "트래킹 광고 매체", "트래킹 유입 구분",
  "결제ID", "환불일",
] as const;
const text = (value: unknown) => String(value ?? "").trim();
const headerKey = (value: unknown) => text(value).replace(/\s+/gu, "");

export function splitCourseOrderProduct(productName: string) {
  // Prefer a spaced separator so hyphens inside the course name are preserved.
  const spaced = [...productName.matchAll(/\s+-\s+/gu)].at(-1);
  const index = spaced?.index ?? productName.lastIndexOf("-");
  return index < 0
    ? { courseName: productName, optionName: "" }
    : { courseName: productName.slice(0, index).trim(), optionName: productName.slice(index + (spaced?.[0].length ?? 1)).trim() };
}

function amount(value: unknown, label: string, row: number) {
  const raw = text(value).replace(/,/gu, "").replace(/\s*원$/u, "");
  if (!raw) return 0;
  if (!/^-?\d+(?:\.\d{1,2})?$/u.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 1e12) {
    throw new Error(`${row}행 ${label}이 올바른 금액이 아닙니다.`);
  }
  return Number(raw);
}

function refundDate(value: unknown, row: number) {
  if (value === null || value === undefined || text(value) === "" || text(value) === "-") return "";
  const raw = value instanceof Date ? value.toISOString() : text(value);
  const match = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|[T\s])/u);
  if (match) {
    const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const parsed = new Date(`${result}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(result)) return result;
  }
  throw new Error(`${row}행 환불일이 올바른 날짜가 아닙니다.`);
}

export function parseCourseOrders(matrix: unknown[][]): CourseOrder[] {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => headerKey(cell) === "주문항목명"));
  if (headerIndex < 0) throw new Error("주문항목명 열을 찾지 못했습니다.");
  const headers = matrix[headerIndex].map(headerKey);
  const missing = COURSE_ORDER_HEADERS.filter((name) => !headers.includes(headerKey(name)));
  if (missing.length) throw new Error(`필수 열이 없습니다: ${missing.join(", ")}`);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("중복된 열 이름이 있습니다.");
  const columns = new Map(headers.map((name, index) => [name, index]));
  const get = (row: unknown[], name: string) => row[columns.get(headerKey(name)) ?? -1];
  const rows = matrix.slice(headerIndex + 1).flatMap((row, index): CourseOrder[] => {
    if (row.every((cell) => !text(cell))) return [];
    const rowNumber = headerIndex + index + 2;
    const productName = text(get(row, "주문항목명"));
    if (!productName) throw new Error(`${rowNumber}행 주문항목명이 비어 있습니다.`);
    const paymentId = text(get(row, "결제ID"));
    const orderId = text(get(row, "주문ID"));
    const isSplitPayment = headerKey(get(row, "결제유형")) === "분할결제";
    const orderNumber = text(get(row, "주문번호"));
    if (isSplitPayment && !orderNumber) throw new Error(`${rowNumber}행 분할결제의 주문번호가 비어 있습니다.`);
    if (!paymentId && !orderId) throw new Error(`${rowNumber}행 결제ID와 주문ID가 모두 비어 있습니다.`);
    const phoneValue = get(row, "휴대전화번호");
    let phone = text(phoneValue).replace(/[^\d+]/gu, "");
    if (typeof phoneValue === "number" && /^10\d{8}$/u.test(phone)) phone = `0${phone}`;
    return [{
      productName, optionName: splitCourseOrderProduct(productName).optionName,
      memberName: text(get(row, "회원명")), phone, email: text(get(row, "이메일")),
      paymentAmount: amount(get(row, "결제금액"), "결제금액", rowNumber),
      refundAmount: amount(get(row, "환불금액"), "환불금액", rowNumber),
      currentAmount: amount(get(row, "현 결제금액"), "현 결제금액", rowNumber),
      status: text(get(row, "주문상태")), paymentMethod: text(get(row, "결제방법")),
      rs: text(get(row, "RS")), adMedia: text(get(row, "트래킹 광고 매체")),
      inflowType: text(get(row, "트래킹 유입 구분")), paymentId, orderId,
      ...(isSplitPayment ? { splitOrderNumber: orderNumber } : {}),
      refundDate: refundDate(get(row, "환불일"), rowNumber),
    }];
  });
  if (!rows.length) throw new Error("저장할 주문 데이터가 없습니다.");
  if (rows.length > 10_000) throw new Error("한 번에 최대 10,000건까지 가져올 수 있습니다.");
  return mergeSplitPayments(rows);
}

function mergeSplitPayments(rows: CourseOrder[]): CourseOrder[] {
  const groups = new Map<string, CourseOrder[]>();
  for (const row of rows) {
    if (!row.splitOrderNumber) continue;
    const group = groups.get(row.splitOrderNumber) ?? [];
    group.push(row);
    groups.set(row.splitOrderNumber, group);
  }
  const emitted = new Set<string>();
  return rows.flatMap((row): CourseOrder[] => {
    if (!row.splitOrderNumber) return [row];
    if (emitted.has(row.splitOrderNumber)) return [];
    emitted.add(row.splitOrderNumber);
    const payments = new Map<string, CourseOrder>();
    for (const payment of groups.get(row.splitOrderNumber)!) {
      const key = payment.paymentId || JSON.stringify(payment);
      const previous = payments.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(payment)) {
        throw new Error("같은 분할결제의 결제ID에 서로 다른 정보가 있습니다. 파일에서 해당 결제 내역을 확인해 주세요.");
      }
      payments.set(key, payment);
    }
    const parts = [...payments.values()];
    const join = (field: keyof CourseOrder) => [...new Set(parts.map((part) => String(part[field] ?? "")).filter(Boolean))].sort().join(" / ");
    const sum = (field: "paymentAmount" | "refundAmount" | "currentAmount") => {
      const total = parts.reduce((value, part) => value + Math.round(part[field] * 100), 0) / 100;
      if (Math.abs(total) > 1e12) throw new Error("분할결제 합산 금액이 저장 가능한 범위를 초과했습니다.");
      return total;
    };
    return [{
      ...row,
      productName: join("productName"), optionName: join("optionName"),
      memberName: join("memberName"), phone: join("phone"), email: join("email"),
      paymentAmount: sum("paymentAmount"), refundAmount: sum("refundAmount"), currentAmount: sum("currentAmount"),
      status: join("status"), paymentMethod: join("paymentMethod"), rs: join("rs"),
      adMedia: join("adMedia"), inflowType: join("inflowType"), paymentId: join("paymentId"), orderId: join("orderId"),
      refundDate: parts.map((part) => part.refundDate).sort().at(-1) ?? "",
    }];
  });
}

export function buildCourseOrderPreview(rows: CourseOrder[], courseName: string): CourseOrderPreview {
  const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/\s+/gu, "");
  const course = normalize(courseName);
  const groups = new Map<string, CourseOrderPreview["products"][number]>();
  for (const row of rows) {
    const group = groups.get(row.productName);
    if (group) group.count++;
    else groups.set(row.productName, {
      name: row.productName, optionName: row.optionName, count: 1,
      suggested: course.length > 0 && normalize(splitCourseOrderProduct(row.productName).courseName).includes(course),
    });
  }
  return { totalCount: rows.length, products: [...groups.values()].sort((a, b) => Number(b.suggested) - Number(a.suggested) || b.count - a.count) };
}

export function courseOrderIdentity(row: CourseOrder) {
  if (row.splitOrderNumber) return JSON.stringify(["split-order", row.splitOrderNumber]);
  return JSON.stringify([row.orderId ? "order" : "payment", row.orderId || row.paymentId, row.productName]);
}

export function selectCourseOrders(rows: CourseOrder[], productNames: string[]) {
  if (!productNames.length) throw new Error("이 강의에 연결할 주문항목을 선택해 주세요.");
  const products = new Set(rows.map((row) => row.productName));
  if (productNames.some((name) => !products.has(name))) throw new Error("파일에 없는 주문항목이 포함되어 있습니다. 파일을 다시 확인해 주세요.");
  const selected = new Set(productNames);
  const unique = new Map<string, CourseOrder>();
  for (const row of rows) {
    if (!selected.has(row.productName)) continue;
    const key = courseOrderIdentity(row);
    const previous = unique.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      throw new Error("같은 주문항목에 서로 다른 결제 정보가 중복되어 있습니다. 파일에서 중복 주문을 확인해 주세요.");
    }
    unique.set(key, row);
  }
  return [...unique.values()];
}
