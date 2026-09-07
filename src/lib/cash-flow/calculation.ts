export type CashFlowPlan = {
  courseId: string;
  expectedMonth: string;
  novaInflow: number;
  instructorPayout: number;
  isIncluded: boolean;
};

export type CashFlowMonth = {
  month: string;
  openingBalance: number;
  novaInflow: number;
  instructorPayout: number;
  fixedExpense: number;
  netChange: number;
  closingBalance: number;
};

export function normalizeMonth(value: string) {
  const match = /^(\d{4})-(\d{2})/u.exec(value);
  return match ? `${match[1]}-${match[2]}` : "";
}

export function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function forecastCashFlow(input: {
  startMonth: string;
  currentBalance: number;
  monthlyFixedExpense: number;
  plans: CashFlowPlan[];
  months?: number;
}): CashFlowMonth[] {
  const monthCount = Math.max(1, Math.trunc(input.months ?? 13));
  const totals = new Map<string, { novaInflow: number; instructorPayout: number }>();
  for (const plan of input.plans) {
    if (!plan.isIncluded) continue;
    const month = normalizeMonth(plan.expectedMonth);
    if (!month) continue;
    const current = totals.get(month) ?? { novaInflow: 0, instructorPayout: 0 };
    current.novaInflow += Math.max(0, Math.round(plan.novaInflow));
    current.instructorPayout += Math.max(0, Math.round(plan.instructorPayout));
    totals.set(month, current);
  }

  const result: CashFlowMonth[] = [];
  let openingBalance = Math.round(input.currentBalance);
  const fixedExpense = Math.max(0, Math.round(input.monthlyFixedExpense));
  for (let index = 0; index < monthCount; index += 1) {
    const month = addMonths(input.startMonth, index);
    const flow = totals.get(month) ?? { novaInflow: 0, instructorPayout: 0 };
    const netChange = flow.novaInflow - flow.instructorPayout - fixedExpense;
    const closingBalance = openingBalance + netChange;
    result.push({
      month,
      openingBalance,
      novaInflow: flow.novaInflow,
      instructorPayout: flow.instructorPayout,
      fixedExpense,
      netChange,
      closingBalance,
    });
    openingBalance = closingBalance;
  }
  return result;
}
