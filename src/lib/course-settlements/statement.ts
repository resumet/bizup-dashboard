import {
  createDefaultSettlementCosts,
  roundWon,
  type CostBurden,
  type SettlementCost,
} from "@/lib/course-settlements/engine";

export type SettlementStatementDraft = {
  issueDate: string;
  lectureName: string;
  coursePeriod: string;
  settlementPeriod: string;
  manager: string;
  status: "작성중" | "검토대기" | "정산확정";
  instructorRatioPercent: number;
  costs: SettlementCost[];
  exceptionReason: string;
  confirmedAt: string;
};

const BURDENS = new Set<CostBurden>(["company", "instructor", "shared"]);
const EVIDENCE_TYPES = new Set<SettlementCost["evidenceType"]>([
  "세금계산서",
  "종이영수증",
  "카드영수증",
  "계좌이체 내역",
  "계약서",
  "기타",
]);

export function createSettlementStatementDraft(
  courseName: string,
): SettlementStatementDraft {
  return {
    issueDate: new Date().toLocaleDateString("sv-SE"),
    lectureName: courseName,
    coursePeriod: "",
    settlementPeriod: "",
    manager: "",
    status: "작성중",
    instructorRatioPercent: 50,
    costs: createDefaultSettlementCosts(),
    exceptionReason: "",
    confirmedAt: "",
  };
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function sanitizeSettlementStatementDraft(
  value: unknown,
  courseName: string,
): SettlementStatementDraft {
  const fallback = createSettlementStatementDraft(courseName);
  if (typeof value !== "object" || value === null) return fallback;
  const input = value as Record<string, unknown>;
  const costs = Array.isArray(input.costs)
    ? input.costs.flatMap((rawCost, index): SettlementCost[] => {
        if (typeof rawCost !== "object" || rawCost === null) return [];
        const cost = rawCost as Record<string, unknown>;
        const burden = BURDENS.has(cost.burden as CostBurden)
          ? (cost.burden as CostBurden)
          : "company";
        const evidenceType = EVIDENCE_TYPES.has(
          cost.evidenceType as SettlementCost["evidenceType"],
        )
          ? (cost.evidenceType as SettlementCost["evidenceType"])
          : "기타";
        const amount = Number(cost.amount);
        return [
          {
            id: stringValue(cost.id, 200) || `cost-${index + 1}`,
            name: stringValue(cost.name, 200),
            burden,
            manager: stringValue(cost.manager, 100),
            amount: Number.isFinite(amount) ? Math.max(0, roundWon(amount)) : 0,
            occurredOn: stringValue(cost.occurredOn, 10),
            note: stringValue(cost.note, 2_000),
            evidenceRequired: cost.evidenceRequired === true,
            evidenceType,
            evidenceNeedsReview: cost.evidenceNeedsReview === true,
            attachments: [],
          },
        ];
      })
    : fallback.costs;
  const ratio = Number(input.instructorRatioPercent);
  const status = ["작성중", "검토대기", "정산확정"].includes(
    String(input.status),
  )
    ? (input.status as SettlementStatementDraft["status"])
    : "작성중";

  return {
    issueDate: stringValue(input.issueDate, 10) || fallback.issueDate,
    lectureName: stringValue(input.lectureName, 200) || courseName,
    coursePeriod: stringValue(input.coursePeriod, 200),
    settlementPeriod: stringValue(input.settlementPeriod, 200),
    manager: stringValue(input.manager, 100),
    status,
    instructorRatioPercent: Number.isFinite(ratio)
      ? Math.min(100, Math.max(0, ratio))
      : 50,
    costs,
    exceptionReason: stringValue(input.exceptionReason, 2_000),
    confirmedAt: stringValue(input.confirmedAt, 40),
  };
}
