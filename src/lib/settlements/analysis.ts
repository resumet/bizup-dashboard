export const SETTLEMENT_HEADERS = [
  "플랫폼명",
  "정산월",
  "정산 예정일",
  "강의명",
  "강사명",
  "기수",
  "주문번호",
  "회원명",
  "이메일",
  "결제일",
  "결제금액",
  "매출금액",
  "할부개월수",
  "PG사 수수료",
  "PG사 수수료율(%)",
  "노바 수수료금액",
  "노바 수수료율(%)",
  "정산금액",
  "결제수단",
  "주문상태",
  "매출일",
] as const;

export type SettlementRow = {
  platform: string;
  settlementMonth: string;
  settlementDate: string;
  course: string;
  instructor: string;
  cohort: string;
  orderNumber: string;
  memberName: string;
  email: string;
  paymentDate: string;
  paymentAmount: number;
  salesAmount: number;
  installment: string;
  pgFee: number;
  pgFeeRate: string;
  novaFee: number;
  novaFeeRate: string;
  settlementAmount: number;
  paymentMethod: string;
  orderStatus: string;
  salesDate: string;
};

export type SettlementMetrics = Pick<
  SettlementRow,
  "salesAmount" | "pgFee" | "novaFee" | "settlementAmount"
> & { count: number };

export type SettlementGroup = SettlementMetrics & { name: string };

function text(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/gu, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/u);
  return match
    ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
    : raw;
}

const COURSE_SALES_PREFIX =
  /^[（(]\s*(?:추가\s*결제\s*\d*|기\s*수강생용|기존\s*수강생용|개강\s*후\s*결제|재\s*결제)\s*[)）]\s*/u;

export function normalizeSettlementCourseName(value: unknown) {
  let courseName = text(value).replace(/\s+/gu, " ");
  while (COURSE_SALES_PREFIX.test(courseName)) {
    courseName = courseName.replace(COURSE_SALES_PREFIX, "").trim();
  }
  return courseName || "강의명 없음";
}

function isTestCourse(courseName: string) {
  return courseName.replace(/\s+/gu, "") === "테스트강의";
}

function isFullyRefunded(orderStatus: unknown) {
  return text(orderStatus).replace(/\s+/gu, "") === "환불";
}

export function parseSettlementRows(matrix: unknown[][]) {
  if (matrix.length < 2) throw new Error("정산 데이터가 없습니다.");
  const headers = matrix[0].map(text);
  const missing = SETTLEMENT_HEADERS.filter(
    (header) => !headers.includes(header),
  );
  if (missing.length > 0) {
    throw new Error(`필수 열이 없습니다: ${missing.join(", ")}`);
  }
  const column = Object.fromEntries(
    headers.map((header, index) => [header, index]),
  );
  const get = (row: unknown[], header: (typeof SETTLEMENT_HEADERS)[number]) =>
    row[column[header]];

  return matrix.slice(1).flatMap((row) => {
    if (row.every((value) => text(value) === "")) return [];
    if (isFullyRefunded(get(row, "주문상태"))) return [];
    const course = normalizeSettlementCourseName(get(row, "강의명"));
    if (isTestCourse(course)) return [];
    return [
      {
        platform: text(get(row, "플랫폼명")),
        settlementMonth: text(get(row, "정산월")),
        settlementDate: normalizeDate(get(row, "정산 예정일")),
        course,
        instructor: text(get(row, "강사명")) || "강사명 없음",
        cohort: text(get(row, "기수")),
        orderNumber: text(get(row, "주문번호")),
        memberName: text(get(row, "회원명")),
        email: text(get(row, "이메일")).toLowerCase(),
        paymentDate: normalizeDate(get(row, "결제일")),
        paymentAmount: number(get(row, "결제금액")),
        salesAmount: number(get(row, "매출금액")),
        installment: text(get(row, "할부개월수")) || "미분류",
        pgFee: number(get(row, "PG사 수수료")),
        pgFeeRate: text(get(row, "PG사 수수료율(%)")),
        novaFee: number(get(row, "노바 수수료금액")),
        novaFeeRate: text(get(row, "노바 수수료율(%)")),
        settlementAmount: number(get(row, "정산금액")),
        paymentMethod: text(get(row, "결제수단")) || "미분류",
        orderStatus: text(get(row, "주문상태")),
        salesDate: normalizeDate(get(row, "매출일")),
      },
    ];
  }) satisfies SettlementRow[];
}

function metrics(rows: SettlementRow[]): SettlementMetrics {
  return rows.reduce<SettlementMetrics>(
    (sum, row) => ({
      count: sum.count + 1,
      salesAmount: sum.salesAmount + row.salesAmount,
      pgFee: sum.pgFee + row.pgFee,
      novaFee: sum.novaFee + row.novaFee,
      settlementAmount: sum.settlementAmount + row.settlementAmount,
    }),
    { count: 0, salesAmount: 0, pgFee: 0, novaFee: 0, settlementAmount: 0 },
  );
}

function groupMetrics(
  rows: SettlementRow[],
  getName: (row: SettlementRow) => string,
) {
  const groups = new Map<string, SettlementRow[]>();
  for (const row of rows) {
    const name = getName(row);
    const group = groups.get(name);
    if (group) group.push(row);
    else groups.set(name, [row]);
  }
  return [...groups]
    .map(([name, items]) => ({ name, ...metrics(items) }))
    .toSorted((a, b) => b.salesAmount - a.salesAmount);
}

function frequency(
  rows: SettlementRow[],
  getName: (row: SettlementRow) => string,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = getName(row);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .toSorted(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"),
    );
}

export function analyzeSettlements(rows: SettlementRow[]) {
  const duplicateGroups = new Map<
    string,
    Array<{ row: SettlementRow; rowIndex: number }>
  >();
  for (const [rowIndex, row] of rows.entries()) {
    const key = row.email || `name:${row.memberName}`;
    if (!key || key === "name:") continue;
    const group = duplicateGroups.get(key);
    const item = { row, rowIndex };
    if (group) group.push(item);
    else duplicateGroups.set(key, [item]);
  }
  const duplicates = [...duplicateGroups.values()]
    .map((items) => {
      const orderKeys = new Set(
        items.map(({ row, rowIndex }) =>
          row.orderNumber ? `order:${row.orderNumber}` : `row:${rowIndex}`,
        ),
      );
      return {
        name: items[0].row.memberName,
        email: items[0].row.email,
        purchaseCount: orderKeys.size,
        salesAmount: items.reduce(
          (sum, { row }) => sum + row.salesAmount,
          0,
        ),
        courses: [...new Set(items.map(({ row }) => row.course))],
      };
    })
    .filter((person) => person.purchaseCount > 1)
    .toSorted(
      (a, b) =>
        b.purchaseCount - a.purchaseCount || b.salesAmount - a.salesAmount,
    );

  return {
    totals: metrics(rows),
    instructors: groupMetrics(rows, (row) => row.instructor),
    courses: groupMetrics(rows, (row) => row.course),
    installments: frequency(rows, (row) => row.installment),
    paymentMethods: frequency(rows, (row) => row.paymentMethod),
    trend: groupMetrics(rows, (row) => row.salesDate || "날짜 없음").toSorted(
      (a, b) => a.name.localeCompare(b.name),
    ),
    duplicates,
  };
}

export function buildRevenueStrategies(rows: SettlementRow[]) {
  const analysis = analyzeSettlements(rows);
  const topInstructor = analysis.instructors[0];
  const topCourse = analysis.courses[0];
  const topPayment = analysis.paymentMethods[0];
  const total = analysis.totals.salesAmount || 1;
  const instructorShare = topInstructor
    ? Math.round((topInstructor.salesAmount / total) * 100)
    : 0;
  return [
    {
      title: "상위 강사·강의의 재판매 구조 강화",
      description:
        topInstructor && topCourse
          ? `${topInstructor.name} 강사가 전체 매출의 ${instructorShare}%를 만들고 있습니다. ${topCourse.name}의 후기·성과를 재활용한 앵콜, 후속 과정, 업셀 상품을 우선 설계하세요.`
          : "상위 매출 강의의 후기와 성과를 활용해 앵콜 및 후속 상품을 설계하세요.",
    },
    {
      title: "주 결제수단에 맞춘 전환 최적화",
      description: topPayment
        ? `${topPayment.name} 결제가 ${topPayment.count.toLocaleString("ko-KR")}건으로 가장 많습니다. 결제 페이지에서 이 수단을 먼저 노출하고, 수수료가 낮은 수단에는 혜택을 붙여 순매출을 높이세요.`
        : "결제수단별 전환율과 수수료를 비교해 우선 노출 순서를 조정하세요.",
    },
    {
      title: "중복 결제자를 재구매 핵심군으로 운영",
      description: `중복 결제 고객 ${analysis.duplicates.length.toLocaleString("ko-KR")}명을 별도 세그먼트로 관리해 신규 강의 선공개, 묶음 할인, 추천 보상 캠페인을 운영하세요.`,
    },
  ];
}
