export const SETTLEMENT_ENGINE_VERSION = "2026.08.09.1";

export type Cell = string | number | boolean | Date | null | undefined;
export type WorkbookSheet = { sheet: string; data: Cell[][] };
export type WorkbookInput = {
  fileName: string;
  fileSize: number;
  lastModified?: number;
  inputOrder: number;
  sheets: WorkbookSheet[];
};

export type InstructorSettlement = {
  instructor: string;
  totalSales: number;
  tossSales: number;
  pgFee: number;
  cashPayments: number;
  cashCancellations: number;
  cashSales: number;
  settlementBase: number;
  systemNovaFee: number;
  additionalServiceFee: number;
  settlementAmount: number;
  finalSettlement: number;
  tossMatchCount: number;
  cashMatchCount: number;
  serviceMatchCount: number;
};

export type SummaryComparison = {
  key: keyof Pick<InstructorSettlement, "totalSales" | "tossSales" | "pgFee" | "cashSales" | "settlementBase" | "systemNovaFee" | "additionalServiceFee" | "settlementAmount">;
  label: string;
  calculatedValue: number;
  summaryValue: number | null;
  difference: number | null;
  matches: boolean;
};

export type MonthlyAnalysis = {
  fileName: string;
  fileSize: number;
  inputOrder: number;
  periodLabel: string;
  periodYear: number | null;
  periodMonth: number | null;
  summaryTitle: string;
  hasCashSheet: boolean;
  instructorResults: InstructorSettlement[];
  totals: InstructorSettlement;
  comparisons: SummaryComparison[];
  allMatched: boolean;
  detailsByInstructor: Record<string, InstructorSourceDetails>;
};

export type InstructorSourceDetails = {
  toss: Array<{ date: string; paymentMethod: string; status: string; agency: string; buyer: string; amount: number; pgFee: number; supplyAmount: number; vat: number; acquiringStatus: string }>;
  cash: Array<{ date: string; buyer: string; email: string; phone: string; paymentAmount: number; cancellationAmount: number; lectureName: string }>;
  service: Array<{ serviceName: string; date: string; otherCost: number; total: number; note: string }>;
};

export type AggregatedInstructorSettlement = InstructorSettlement & {
  monthlySettlements: Array<{ fileName: string; periodLabel: string; result: InstructorSettlement }>;
};

export type SettlementAnalysis = {
  engineVersion: string;
  monthlyAnalyses: MonthlyAnalysis[];
  instructorResults: AggregatedInstructorSettlement[];
  totals: InstructorSettlement;
  matchedCount: number;
  comparisonCount: number;
  allMatched: boolean;
};

export type StatementExpense = {
  id?: string;
  section: "B" | "C" | "D" | "E";
  group?: string;
  name: string;
  amount: number;
  note?: string;
};

export type StatementParticipant = { name: string; sharePercent: number };

export type CostBurden = "company" | "instructor" | "shared";
export type SettlementCost = {
  id: string;
  name: string;
  burden: CostBurden;
  manager: string;
  amount: number;
  occurredOn: string;
  note: string;
  evidenceRequired: boolean;
  evidenceType: "세금계산서" | "종이영수증" | "카드영수증" | "계좌이체 내역" | "계약서" | "기타";
  evidenceNeedsReview: boolean;
  attachments: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    file?: File;
    url?: string | null;
  }>;
};

export const DEFAULT_SETTLEMENT_COSTS: Array<Pick<SettlementCost, "name" | "burden">> = [
  { name: "유튜브 출연료(고정비)", burden: "company" },
  { name: "교안 제작비", burden: "company" },
  { name: "상세페이지 제작비", burden: "company" },
  { name: "스튜디오 대여비", burden: "company" },
  { name: "진행 PD 인건비", burden: "company" },
  { name: "광고 집행비", burden: "company" },
  { name: "오프라인 행사장 대여비", burden: "company" },
  { name: "인스타그램 대행비", burden: "instructor" },
  { name: "유튜브 출연 RS 비용", burden: "shared" },
  { name: "광고비", burden: "shared" },
];

export function createDefaultSettlementCosts(): SettlementCost[] {
  return DEFAULT_SETTLEMENT_COSTS.map((item, index) => ({
    id: `default-${item.burden}-${index}`, ...item, manager: "", amount: 0, occurredOn: "", note: "",
    evidenceRequired: false, evidenceType: "세금계산서", evidenceNeedsReview: false, attachments: [],
  }));
}

export function calculateCostSettlement(input: {
  totalSales: number;
  pgFee: number;
  novaFee: number;
  costs: SettlementCost[];
  instructorRatioPercent: number;
}) {
  const costs = input.costs.reduce((totals, cost) => {
    totals[cost.burden] += roundWon(parseAmount(cost.amount));
    return totals;
  }, { company: 0, instructor: 0, shared: 0 });
  const instructorRatioPercent = Number.isFinite(input.instructorRatioPercent)
    ? Math.min(100, Math.max(0, input.instructorRatioPercent))
    : 50;
  const companyRatioPercent = 100 - instructorRatioPercent;
  const settlementTargetRevenue = roundWon(input.totalSales - input.pgFee - input.novaFee);
  const distributionBase = roundWon(settlementTargetRevenue - costs.shared);
  const instructorBase = roundWon(distributionBase * instructorRatioPercent / 100);
  const companyBase = roundWon(distributionBase * companyRatioPercent / 100);
  const instructorSupply = roundWon(instructorBase - costs.instructor);
  const vat = roundWon(instructorSupply * 0.1);
  const instructorFinal = roundWon(instructorSupply + vat);
  const companyFinal = roundWon(companyBase - costs.company);
  return {
    totalSales: roundWon(input.totalSales),
    pgFee: roundWon(input.pgFee),
    novaFee: roundWon(input.novaFee),
    totalFee: roundWon(input.pgFee + input.novaFee),
    settlementTargetRevenue,
    costs,
    instructorRatioPercent,
    companyRatioPercent,
    distributionBase,
    instructorBase,
    companyBase,
    instructorSupply,
    vat,
    instructorFinal,
    companyFinal,
  };
}

const SHEETS = {
  toss: "비즈업_토스",
  cash: "비즈업_무통장",
  service: "비즈업_부가서비스",
  summary: "비즈업_요약",
} as const;

const SUMMARY_FIELDS: Array<{ label: string; key: SummaryComparison["key"] }> = [
  { label: "총매출", key: "totalSales" },
  { label: "토스매출액", key: "tossSales" },
  { label: "PG수수료", key: "pgFee" },
  { label: "현금매출액", key: "cashSales" },
  { label: "정산기준액", key: "settlementBase" },
  { label: "시스템노바 수수료", key: "systemNovaFee" },
  { label: "부가서비스 이용료", key: "additionalServiceFee" },
  { label: "비즈업클래스 정산금", key: "settlementAmount" },
];

export function normalizeName(value: unknown) {
  if (value == null || value instanceof Date) return "";
  return String(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
}

function normalizedText(value: unknown) {
  return value == null ? "" : String(value).normalize("NFKC").trim();
}

function displayValue(value: unknown) {
  if (!(value instanceof Date)) return normalizeName(value);
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  return hours === "00" && minutes === "00" ? date : `${date} ${hours}:${minutes}`;
}

export function parseAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const original = value.trim();
  if (!original) return 0;
  const parenthesized = /^\([\s\S]*\)$/u.test(original);
  const cleaned = original.replace(/[₩원,\s()]/gu, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return parenthesized ? -Math.abs(parsed) : parsed;
}

export function roundWon(value: number) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function parseSummaryAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[₩원,\s]/gu, "");
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyResult(instructor = ""): InstructorSettlement {
  return {
    instructor,
    totalSales: 0,
    tossSales: 0,
    pgFee: 0,
    cashPayments: 0,
    cashCancellations: 0,
    cashSales: 0,
    settlementBase: 0,
    systemNovaFee: 0,
    additionalServiceFee: 0,
    settlementAmount: 0,
    finalSettlement: 0,
    tossMatchCount: 0,
    cashMatchCount: 0,
    serviceMatchCount: 0,
  };
}

const SUM_FIELDS = [
  "totalSales", "tossSales", "pgFee", "cashPayments", "cashCancellations", "cashSales",
  "settlementBase", "systemNovaFee", "additionalServiceFee", "settlementAmount", "finalSettlement",
  "tossMatchCount", "cashMatchCount", "serviceMatchCount",
] as const;

function addResult(target: InstructorSettlement, value: InstructorSettlement) {
  for (const field of SUM_FIELDS) target[field] += value[field];
  target.totalSales = target.tossSales + target.cashSales;
  return target;
}

function rowHasValue(row: Cell[]) {
  return row.some((value) => value != null && normalizedText(value) !== "");
}

function validateServiceRows(rows: Cell[][], fileName: string) {
  const headerIndex = rows.findIndex((row) => normalizeName(row[1]) === "강사명");
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (let index = start; index < rows.length; index += 1) {
    if (rowHasValue(rows[index]) && !normalizeName(rows[index][1])) {
      throw new Error(`${fileName}: 비즈업_부가서비스 ${index + 1}행의 강사명이 비어 있습니다.`);
    }
  }
}

function sumCells(rows: Cell[][], instructor: string, instructorColumn: number, amountColumn: number) {
  return rows.reduce((sum, row) => normalizeName(row[instructorColumn]) === instructor
    ? sum + roundWon(parseAmount(row[amountColumn]))
    : sum, 0);
}

function analyzeInstructor(instructor: string, tossRows: Cell[][], cashRows: Cell[][], serviceRows: Cell[][]) {
  const tossMatches = tossRows.filter((row) => normalizeName(row[19]) === instructor);
  const cashMatches = cashRows.filter((row) => normalizeName(row[8]) === instructor);
  const serviceMatches = serviceRows.filter((row) => normalizeName(row[1]) === instructor);
  const tossSales = sumCells(tossMatches, instructor, 19, 10);
  const pgFee = sumCells(tossMatches, instructor, 19, 11);
  const cashPayments = sumCells(cashMatches, instructor, 8, 5);
  const cashCancellations = sumCells(cashMatches, instructor, 8, 6);
  const additionalServiceFee = roundWon(sumCells(serviceMatches, instructor, 1, 5));
  const cashSales = roundWon(cashPayments + cashCancellations);
  const totalSales = roundWon(tossSales + cashSales);
  const settlementBase = roundWon(totalSales - pgFee);
  const systemNovaFee = roundWon(settlementBase * 0.033);
  const novaSettlementBase = roundWon(settlementBase - cashSales);
  const settlementAmount = roundWon(novaSettlementBase - systemNovaFee - additionalServiceFee);
  const finalSettlement = roundWon(settlementAmount + cashSales);
  return {
    instructor,
    totalSales,
    tossSales,
    pgFee,
    cashPayments,
    cashCancellations,
    cashSales,
    settlementBase,
    systemNovaFee,
    additionalServiceFee,
    settlementAmount,
    finalSettlement,
    tossMatchCount: tossMatches.length,
    cashMatchCount: cashMatches.length,
    serviceMatchCount: serviceMatches.length,
  } satisfies InstructorSettlement;
}

function findSummaryTitle(rows: Cell[][]) {
  for (const row of rows) {
    for (const cell of row) {
      const value = normalizedText(cell);
      if (value.includes("비즈업클래스") && value.includes("매출 요약")) return value;
    }
  }
  return "비즈업클래스 매출 요약";
}

function findSummaryValue(rows: Cell[][], label: string) {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (normalizedText(row[index]) !== label) continue;
      for (let valueIndex = index + 1; valueIndex < row.length; valueIndex += 1) {
        const value = parseSummaryAmount(row[valueIndex]);
        if (value != null) return roundWon(value);
      }
      return null;
    }
  }
  return null;
}

function periodParts(title: string, fileName: string) {
  const titleYearMonth = title.match(/(?:(\d{2}|\d{4})\s*년\s*)?(1[0-2]|0?[1-9])\s*월/u);
  const fileYearMonth = fileName.replace(/\.xlsx$/iu, "").match(/(?:^|\D)(\d{2}|\d{4})[._-](1[0-2]|0[1-9])(?:\D|$)/u);
  const rawYear = titleYearMonth?.[1] ?? fileYearMonth?.[1];
  const rawMonth = titleYearMonth?.[2] ?? fileYearMonth?.[2];
  const year = rawYear ? (Number(rawYear) < 100 ? Number(rawYear) + 2000 : Number(rawYear)) : null;
  const month = rawMonth ? Number(rawMonth) : null;
  return {
    year,
    month,
    label: month ? `${year ? `${year}년 ` : ""}${month}월` : fileName.replace(/\.xlsx$/iu, ""),
  };
}

export function analyzeWorkbook(input: WorkbookInput): MonthlyAnalysis {
  const sheetMap = new Map(input.sheets.map((item) => [normalizedText(item.sheet), item.data]));
  const missing = [SHEETS.toss, SHEETS.service, SHEETS.summary].filter((name) => !sheetMap.has(name));
  if (missing.length) throw new Error(`${input.fileName}: 필수 시트가 없습니다: ${missing.join(", ")}`);
  const tossRows = sheetMap.get(SHEETS.toss) ?? [];
  const cashRows = sheetMap.get(SHEETS.cash) ?? [];
  const serviceRows = sheetMap.get(SHEETS.service) ?? [];
  const summaryRows = sheetMap.get(SHEETS.summary) ?? [];
  validateServiceRows(serviceRows, input.fileName);

  const instructors = new Set<string>();
  for (const [rows, column] of [[tossRows, 19], [cashRows, 8], [serviceRows, 1]] as const) {
    for (const row of rows) {
      const instructor = normalizeName(row[column]);
      if (instructor && instructor !== "강사명") instructors.add(instructor);
    }
  }
  const instructorResults = [...instructors]
    .sort((left, right) => left.localeCompare(right, "ko"))
    .map((instructor) => analyzeInstructor(instructor, tossRows, cashRows, serviceRows));
  const totals = instructorResults.reduce((sum, result) => addResult(sum, result), emptyResult("전체"));
  const summaryTitle = findSummaryTitle(summaryRows);
  const period = periodParts(summaryTitle, input.fileName);
  const comparisons = SUMMARY_FIELDS.map(({ label, key }) => {
    const summaryValue = findSummaryValue(summaryRows, label);
    const calculatedValue = totals[key];
    const difference = summaryValue == null ? null : calculatedValue - summaryValue;
    return { key, label, calculatedValue, summaryValue, difference, matches: summaryValue != null && Math.abs(difference ?? 0) < 0.01 };
  });
  const detailsByInstructor = Object.fromEntries(instructorResults.map(({ instructor }) => [instructor, {
    toss: tossRows.filter((row) => normalizeName(row[19]) === instructor).map((row) => ({
      date: displayValue(row[1]), paymentMethod: displayValue(row[5]), status: displayValue(row[6]), agency: displayValue(row[7]), buyer: displayValue(row[8]),
      amount: roundWon(parseAmount(row[10])), pgFee: roundWon(parseAmount(row[11])), supplyAmount: roundWon(parseAmount(row[12])), vat: roundWon(parseAmount(row[13])), acquiringStatus: displayValue(row[15]),
    })),
    cash: cashRows.filter((row) => normalizeName(row[8]) === instructor).map((row) => ({
      date: displayValue(row[1]), buyer: displayValue(row[2]), email: displayValue(row[3]), phone: displayValue(row[4]),
      paymentAmount: roundWon(parseAmount(row[5])), cancellationAmount: roundWon(parseAmount(row[6])), lectureName: displayValue(row[7]),
    })),
    service: serviceRows.filter((row) => normalizeName(row[1]) === instructor).map((row) => ({
      serviceName: displayValue(row[2]), date: displayValue(row[3]), otherCost: roundWon(parseAmount(row[4])), total: roundWon(parseAmount(row[5])), note: displayValue(row[6]),
    })),
  } satisfies InstructorSourceDetails]));
  return {
    fileName: input.fileName,
    fileSize: input.fileSize,
    inputOrder: input.inputOrder,
    periodLabel: period.label,
    periodYear: period.year,
    periodMonth: period.month,
    summaryTitle,
    hasCashSheet: sheetMap.has(SHEETS.cash),
    instructorResults,
    totals,
    comparisons,
    allMatched: comparisons.every((item) => item.matches),
    detailsByInstructor,
  };
}

export function aggregateMonthlyAnalyses(
  analyses: MonthlyAnalysis[],
): SettlementAnalysis {
  if (!analyses.length) throw new Error("분석할 월별 엑셀 파일을 추가해 주세요.");
  const monthlyAnalyses = [...analyses].sort((left, right) => {
    const leftKey = left.periodMonth == null ? Number.MAX_SAFE_INTEGER : (left.periodYear ?? 0) * 100 + left.periodMonth;
    const rightKey = right.periodMonth == null ? Number.MAX_SAFE_INTEGER : (right.periodYear ?? 0) * 100 + right.periodMonth;
    return leftKey - rightKey || left.inputOrder - right.inputOrder;
  });
  const instructorNames = [...new Set(monthlyAnalyses.flatMap((month) => month.instructorResults.map((item) => item.instructor)))]
    .sort((left, right) => left.localeCompare(right, "ko"));
  const instructorResults = instructorNames.map((instructor) => {
    const aggregate = emptyResult(instructor) as AggregatedInstructorSettlement;
    aggregate.monthlySettlements = monthlyAnalyses.map((month) => {
      const result = month.instructorResults.find((item) => item.instructor === instructor) ?? emptyResult(instructor);
      addResult(aggregate, result);
      return { fileName: month.fileName, periodLabel: month.periodLabel, result };
    });
    return aggregate;
  });
  const totals = instructorResults.reduce((sum, result) => addResult(sum, result), emptyResult("전체"));
  const matchedCount = monthlyAnalyses.flatMap((item) => item.comparisons).filter((item) => item.matches).length;
  const comparisonCount = monthlyAnalyses.length * SUMMARY_FIELDS.length;
  return {
    engineVersion: SETTLEMENT_ENGINE_VERSION,
    monthlyAnalyses,
    instructorResults,
    totals,
    matchedCount,
    comparisonCount,
    allMatched: comparisonCount > 0 && matchedCount === comparisonCount,
  };
}

export function analyzeWorkbooks(inputs: WorkbookInput[]): SettlementAnalysis {
  return aggregateMonthlyAnalyses(inputs.map(analyzeWorkbook));
}

export function calculateStatement(input: {
  a: number;
  expenses: StatementExpense[];
  paymentType: "business" | "individual";
  participants?: StatementParticipant[];
}) {
  const sectionTotals = { B: 0, C: 0, D: 0, E: 0 };
  const grouped = new Map<string, number>();
  for (const item of input.expenses) {
    const key = `${item.section}\u0000${item.group ?? ""}`;
    grouped.set(key, (grouped.get(key) ?? 0) + roundWon(parseAmount(item.amount)));
  }
  for (const [key, amount] of grouped) sectionTotals[key[0] as keyof typeof sectionTotals] += roundWon(amount);
  for (const key of Object.keys(sectionTotals) as Array<keyof typeof sectionTotals>) sectionTotals[key] = roundWon(sectionTotals[key]);
  const A = roundWon(input.a);
  const F = roundWon(A - sectionTotals.C - sectionTotals.D);
  const G = roundWon(F * 0.5);
  const H = roundWon(F * 0.5);
  const I = roundWon(G - sectionTotals.E);
  const vat = roundWon(I * 0.1);
  const JBusiness = roundWon(I + vat);
  const withholding = roundWon(I * 0.033);
  const JIndividual = roundWon(I - withholding);
  const K = roundWon(H - sectionTotals.B);
  const selectedPayment = input.paymentType === "business" ? JBusiness : JIndividual;
  const validParticipants = (input.participants ?? []).filter((item) => normalizeName(item.name));
  const participantAmounts = validParticipants.map((item) => ({
    name: normalizeName(item.name),
    sharePercent: Number.isFinite(item.sharePercent) ? Math.max(0, item.sharePercent) : 0,
    amount: roundWon(selectedPayment * (Number.isFinite(item.sharePercent) ? Math.max(0, item.sharePercent) : 0) / 100),
  }));
  const totalPercent = Math.round(participantAmounts.reduce((sum, item) => sum + item.sharePercent, 0) * 1000) / 1000;
  let distributedAmount = roundWon(participantAmounts.reduce((sum, item) => sum + item.amount, 0));
  if (participantAmounts.length && Math.abs(totalPercent - 100) <= 0.0001) {
    participantAmounts[participantAmounts.length - 1].amount += selectedPayment - distributedAmount;
    distributedAmount = selectedPayment;
  }
  return {
    A, ...sectionTotals, F, G, H, I, vat, JBusiness, withholding, JIndividual, K,
    selectedPayment,
    participants: participantAmounts,
    totalPercent,
    distributedAmount,
    remainingAmount: roundWon(selectedPayment - distributedAmount),
  };
}

export function parsePastedExpenses(value: string) {
  const rows = value.replace(/\r\n?/gu, "\n").split("\n").map((line) => {
    const cells = line.split("\t");
    while (cells.length < 5) cells.push("");
    return cells;
  });
  const result: StatementExpense[] = [];
  let section: StatementExpense["section"] | null = null;
  let group = "";
  for (const cells of rows) {
    const code = cells[1].trim().match(/^\(?([B-E])\)?$/iu)?.[1]?.toUpperCase() as StatementExpense["section"] | undefined;
    if (cells[0].trim() && code) { section = code; group = ""; continue; }
    if (!section) continue;
    if (cells[1].trim() && !cells[2].trim()) { group = cells[1].trim(); continue; }
    const name = cells[2].trim();
    if (!name || name.includes("총합") || name.endsWith("합계")) continue;
    result.push({ section, group, name, amount: roundWon(parseAmount(cells[3])), note: cells.slice(4).join(" ").trim() });
  }
  return result;
}
