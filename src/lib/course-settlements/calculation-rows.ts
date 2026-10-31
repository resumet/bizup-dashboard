import type { CourseCost } from "@/lib/course-costs/types";

type SharedCostSource = Pick<CourseCost, "burdenType" | "name" | "grossAmount">;

export type SharedCostCalculationRow = {
  code: string;
  label: string;
  value: number;
  formula: string;
  detail: true;
};

export function sharedCostCalculationRows(
  costs: readonly SharedCostSource[],
): SharedCostCalculationRow[] {
  return costs
    .filter((cost) => cost.burdenType === "SHARED")
    .map((cost, index) => ({
      code: `E-${index + 1}`,
      label: cost.name,
      value: cost.grossAmount,
      formula: "공동 부담 비용 상세",
      detail: true,
    }));
}
