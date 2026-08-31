export const PURCHASE_ORDER_HEADERS = [
  "No.",
  "플랫폼명",
  "주문항목명",
  "회원명",
  "휴대전화번호",
  "이메일",
  "결제금액",
  "환불금액",
  "주문상태",
  "현 결제금액",
  "과세/면세",
  "주문일시",
  "결제일시",
  "결제유형",
  "상품유형",
  "결제방법",
  "RS",
  "트래킹 광고 매체",
  "트래킹 유입 구분",
  "신규 유저 여부",
  "결제ID",
  "주문ID",
  "주문번호",
  "환불일",
  "회원가입일",
  "취소자",
  "취소사유",
  "메모",
] as const;

export type PurchaseOrderRow = {
  platform: string;
  productName: string;
  courseName: string;
  optionName: string;
  memberName: string;
  phone: string;
  email: string;
  paymentAmount: number;
  refundAmount: number;
  status: string;
  currentAmount: number;
  taxType: string;
  orderDate: string;
  paymentDate: string;
  paymentType: string;
  productType: string;
  paymentMethod: string;
  rs: string;
  adMedia: string;
  inflowType: string;
  newUserType: string;
  paymentId: string;
  orderId: string;
  orderNumber: string;
  refundDate: string;
  joinedDate: string;
  canceller: string;
  cancelReason: string;
  memo: string;
};

export type PurchaseGroup = {
  name: string;
  count: number;
  paymentAmount: number;
  refundAmount: number;
  currentAmount: number;
};

const SALES_PREFIX =
  /^[（(]\s*(?:추가\s*결제\s*\d*|기\s*수강생용|기존\s*수강생용|개강\s*후\s*결제|재\s*결제|수업용)\s*[)）]\s*/u;
const SALES_SUFFIX = /\s*[（(]\s*추가\s*결제용\s*[)）]\s*$/u;

function text(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/gu, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function date(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/u);
  return match
    ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
    : raw;
}

export function normalizePurchaseProductName(value: unknown) {
  let name = text(value).replace(/\s+/gu, " ");
  while (SALES_PREFIX.test(name)) name = name.replace(SALES_PREFIX, "").trim();
  name = name.replace(SALES_SUFFIX, "").trim();
  return name || "상품명 없음";
}

export function splitPurchaseProductName(value: unknown) {
  const productName = normalizePurchaseProductName(value);
  const separatorIndex = productName.lastIndexOf(" - ");
  if (separatorIndex < 0) {
    return { productName, courseName: productName, optionName: "옵션 없음" };
  }
  return {
    productName,
    courseName: productName.slice(0, separatorIndex).trim() || "강의명 없음",
    optionName: productName.slice(separatorIndex + 3).trim() || "옵션 없음",
  };
}

function isTestProduct(productName: string) {
  return productName.replace(/\s+/gu, "").startsWith("테스트강의");
}

export function parsePurchaseOrderRows(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error("주문결제 데이터가 없습니다.");
  const headers = matrix[0].map(text);
  const missing = PURCHASE_ORDER_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`필수 열이 없습니다: ${missing.join(", ")}`);
  const columns = Object.fromEntries(headers.map((header, index) => [header, index]));
  const get = (row: unknown[], header: (typeof PURCHASE_ORDER_HEADERS)[number]) =>
    row[columns[header]];

  return matrix.slice(1).flatMap((row) => {
    if (row.every((value) => text(value) === "")) return [];
    const product = splitPurchaseProductName(get(row, "주문항목명"));
    if (isTestProduct(product.productName)) return [];
    return [{
      platform: text(get(row, "플랫폼명")),
      ...product,
      memberName: text(get(row, "회원명")),
      phone: text(get(row, "휴대전화번호")).replace(/\D/gu, ""),
      email: text(get(row, "이메일")).toLowerCase(),
      paymentAmount: number(get(row, "결제금액")),
      refundAmount: number(get(row, "환불금액")),
      status: text(get(row, "주문상태")) || "미분류",
      currentAmount: number(get(row, "현 결제금액")),
      taxType: text(get(row, "과세/면세")) || "미분류",
      orderDate: date(get(row, "주문일시")),
      paymentDate: date(get(row, "결제일시")),
      paymentType: text(get(row, "결제유형")) || "미분류",
      productType: text(get(row, "상품유형")) || "미분류",
      paymentMethod: text(get(row, "결제방법")) || "미분류",
      rs: text(get(row, "RS")),
      adMedia: text(get(row, "트래킹 광고 매체")) || "미분류",
      inflowType: text(get(row, "트래킹 유입 구분")) || "미분류",
      newUserType: text(get(row, "신규 유저 여부")) || "미분류",
      paymentId: text(get(row, "결제ID")),
      orderId: text(get(row, "주문ID")),
      orderNumber: text(get(row, "주문번호")),
      refundDate: date(get(row, "환불일")),
      joinedDate: date(get(row, "회원가입일")),
      canceller: text(get(row, "취소자")),
      cancelReason: text(get(row, "취소사유")),
      memo: text(get(row, "메모")),
    }];
  }) satisfies PurchaseOrderRow[];
}

function rowOrderKey(row: PurchaseOrderRow, index: number) {
  return row.orderNumber || row.orderId || row.paymentId || `row:${index}`;
}

function groupRows(rows: PurchaseOrderRow[], getName: (row: PurchaseOrderRow) => string) {
  const groups = new Map<string, Array<{ row: PurchaseOrderRow; index: number }>>();
  rows.forEach((row, index) => {
    const name = getName(row).trim() || "미분류";
    const group = groups.get(name) ?? [];
    group.push({ row, index });
    groups.set(name, group);
  });
  return [...groups].map(([name, items]) => ({
    name,
    count: new Set(items.map(({ row, index }) => rowOrderKey(row, index))).size,
    paymentAmount: items.reduce((sum, { row }) => sum + row.paymentAmount, 0),
    refundAmount: items.reduce((sum, { row }) => sum + row.refundAmount, 0),
    currentAmount: items.reduce((sum, { row }) => sum + row.currentAmount, 0),
  })).toSorted((left, right) => right.currentAmount - left.currentAmount);
}

export function analyzePurchaseOrders(rows: PurchaseOrderRow[]) {
  const orderGroups = new Map<string, PurchaseOrderRow[]>();
  rows.forEach((row, index) => {
    const key = rowOrderKey(row, index);
    const group = orderGroups.get(key) ?? [];
    group.push(row);
    orderGroups.set(key, group);
  });
  const orderEntries = [...orderGroups.entries()];
  const orders = orderEntries.map(([, items]) => items);
  const paymentAmount = rows.reduce((sum, row) => sum + row.paymentAmount, 0);
  const refundAmount = rows.reduce((sum, row) => sum + row.refundAmount, 0);
  const currentAmount = rows.reduce((sum, row) => sum + row.currentAmount, 0);
  const activeOrderEntries = orderEntries.filter(
    ([, items]) => items.reduce((sum, row) => sum + row.currentAmount, 0) > 0,
  );
  const activeOrders = activeOrderEntries.map(([, items]) => items);
  const activeOrderKeys = new Set(activeOrderEntries.map(([key]) => key));
  const fullRefundOrders = orders.filter(
    (items) =>
      items.reduce((sum, row) => sum + row.currentAmount, 0) === 0 &&
      items.some((row) => row.refundAmount > 0),
  );
  const partialRefundOrders = orders.filter(
    (items) =>
      items.reduce((sum, row) => sum + row.currentAmount, 0) > 0 &&
      items.some((row) => row.refundAmount > 0),
  );

  const customers = new Map<string, Array<{ row: PurchaseOrderRow; index: number }>>();
  rows.forEach((row, index) => {
    const key = row.email || row.phone || `name:${row.memberName}`;
    if (key === "name:") return;
    const group = customers.get(key) ?? [];
    group.push({ row, index });
    customers.set(key, group);
  });
  const repeatCustomers = [...customers.values()].flatMap((items) => {
    const activeItems = items.filter(({ row, index }) =>
      activeOrderKeys.has(rowOrderKey(row, index)),
    );
    if (activeItems.length === 0) return [];
    const orderKeys = new Set(
      activeItems.map(({ row, index }) => rowOrderKey(row, index)),
    );
    return [{
      name: activeItems[0].row.memberName,
      email: activeItems[0].row.email,
      phone: activeItems[0].row.phone,
      purchaseCount: orderKeys.size,
      currentAmount: activeItems.reduce(
        (sum, { row }) => sum + row.currentAmount,
        0,
      ),
      products: [...new Set(activeItems.map(({ row }) => row.productName))],
    }];
  }).filter((customer) => customer.purchaseCount > 1).toSorted(
    (left, right) =>
      right.purchaseCount - left.purchaseCount ||
      right.currentAmount - left.currentAmount,
  );

  return {
    totals: {
      paymentAmount,
      refundAmount,
      currentAmount,
      orderCount: orders.length,
      activeOrderCount: activeOrders.length,
      fullRefundCount: fullRefundOrders.length,
      partialRefundCount: partialRefundOrders.length,
      refundRate: paymentAmount ? (refundAmount / paymentAmount) * 100 : 0,
      averageOrderValue: activeOrders.length ? currentAmount / activeOrders.length : 0,
      customerCount: customers.size,
    },
    courses: groupRows(rows, (row) => row.courseName),
    products: groupRows(rows, (row) => row.productName),
    options: groupRows(rows, (row) => row.optionName),
    statuses: groupRows(rows, (row) => row.status),
    paymentMethods: groupRows(rows, (row) => row.paymentMethod),
    adMedia: groupRows(rows, (row) => row.adMedia === "-" ? "미분류" : row.adMedia),
    inflowTypes: groupRows(rows, (row) => row.inflowType === "-" ? "미분류" : row.inflowType),
    newUserTypes: groupRows(rows, (row) => row.newUserType === "-" ? "미분류" : row.newUserType),
    trend: groupRows(rows, (row) => row.paymentDate || row.orderDate || "날짜 없음")
      .toSorted((left, right) => left.name.localeCompare(right.name)),
    repeatCustomers,
  };
}
