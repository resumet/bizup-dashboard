import type { CashFlowPlan } from "./calculation";

export type CashFlowCoursePlan = CashFlowPlan & {
  courseName: string;
  instructorName: string;
  autoNovaInflow: number;
  autoInstructorPayout: number;
  hasSettlement: boolean;
};

export type CashFlowDashboardData = {
  currentMonth: string;
  currentBalance: number;
  monthlyFixedExpense: number;
  plans: CashFlowCoursePlan[];
  loadError?: string;
};
