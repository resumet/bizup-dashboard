import { summarizeAdPerformance, summarizeOrganicChannels } from "./calculation";
import { getAdPerformanceOutcome, outcomeRatio, type AdPerformanceWebinarOutcome } from "./outcome-summary";
import type { AdPerformanceDailyMetric, AdPerformanceOrganicChannel } from "./types";

type Definition = { key: string; label: string; group: string; unit: "원" | "건" | "명" | "%" | "배"; direction: "higher" | "lower" | "neutral" };
export const bulkMetricDefinitions = [
  { key: "googleSpend", label: "구글 집행비용", group: "집행비용", unit: "원", direction: "neutral" },
  { key: "metaSpend", label: "메타 집행비용", group: "집행비용", unit: "원", direction: "neutral" },
  { key: "spend", label: "전체 집행비용", group: "집행비용", unit: "원", direction: "neutral" },
  { key: "googleBudgetRate", label: "구글 예산 사용률", group: "집행비용", unit: "%", direction: "neutral" },
  { key: "metaBudgetRate", label: "메타 예산 사용률", group: "집행비용", unit: "%", direction: "neutral" },
  { key: "budgetRate", label: "전체 예산 사용률", group: "집행비용", unit: "%", direction: "neutral" },
  { key: "googleAdLeads", label: "구글 광고접수DB", group: "광고접수DB", unit: "건", direction: "higher" },
  { key: "metaAdLeads", label: "메타 광고접수DB", group: "광고접수DB", unit: "건", direction: "higher" },
  { key: "adLeads", label: "전체 광고접수DB", group: "광고접수DB", unit: "건", direction: "higher" },
  { key: "googleLeadCost", label: "구글 광고접수DB단가", group: "광고접수DB", unit: "원", direction: "lower" },
  { key: "metaLeadCost", label: "메타 광고접수DB단가", group: "광고접수DB", unit: "원", direction: "lower" },
  { key: "adLeadCost", label: "전체 광고접수DB단가", group: "광고접수DB", unit: "원", direction: "lower" },
  { key: "paidLandingLeadCost", label: "랜딩접수DB단가", group: "광고접수DB", unit: "원", direction: "lower" },
  { key: "instagram", label: "인스타", group: "오가닉DB", unit: "건", direction: "higher" },
  { key: "youtube", label: "유튜브", group: "오가닉DB", unit: "건", direction: "higher" },
  { key: "unknown", label: "경로불명", group: "오가닉DB", unit: "건", direction: "neutral" },
  { key: "organicLandingLeads", label: "전체 오가닉DB", group: "오가닉DB", unit: "건", direction: "higher" },
  { key: "latestChatRoomMembers", label: "톡방입장인원", group: "톡방입장인원", unit: "명", direction: "higher" },
  { key: "chatRoomEntrantCost", label: "톡방접수DB단가", group: "톡방입장인원", unit: "원", direction: "lower" },
  { key: "databaseLeads", label: "DB 접수", group: "성과 요약", unit: "건", direction: "higher" },
  { key: "chatMembers", label: "톡방 인원", group: "성과 요약", unit: "명", direction: "higher" },
  { key: "chatToDb", label: "톡방 / DB", group: "성과 요약", unit: "%", direction: "higher" },
  { key: "livePeak", label: "라이브 최대 인원", group: "성과 요약", unit: "명", direction: "higher" },
  { key: "liveToDb", label: "라이브 / DB", group: "성과 요약", unit: "%", direction: "higher" },
  { key: "liveToChat", label: "라이브 / 톡방", group: "성과 요약", unit: "%", direction: "higher" },
  { key: "payments", label: "결제 인원", group: "성과 요약", unit: "명", direction: "higher" },
  { key: "paymentToDb", label: "결제 / DB", group: "성과 요약", unit: "%", direction: "higher" },
  { key: "paymentToChat", label: "결제 / 톡방", group: "성과 요약", unit: "%", direction: "higher" },
  { key: "paymentToLive", label: "결제 / 라이브", group: "성과 요약", unit: "%", direction: "higher" },
  { key: "revenue", label: "전체 매출", group: "성과 요약", unit: "원", direction: "higher" },
  { key: "revenueMultiple", label: "광고비 대비 매출", group: "성과 요약", unit: "배", direction: "higher" },
] as const satisfies readonly Definition[];
export type BulkMetricKey = typeof bulkMetricDefinitions[number]["key"];
export type BulkValues = Record<BulkMetricKey, number | null>;
export type AdPerformanceBulkRow = {
  id: string; name: string; instructorName: string; href: string;
  startDate: string; endDate: string | null; values: BulkValues; error?: string;
};

export function bulkValues(metrics: AdPerformanceDailyMetric[], budget: number, channels: AdPerformanceOrganicChannel[], webinar: AdPerformanceWebinarOutcome | null): BulkValues {
  const summary = summarizeAdPerformance(metrics, budget);
  const organic = Object.fromEntries(summarizeOrganicChannels(metrics, channels).map((item) => [item.id, item.count]));
  const outcome = getAdPerformanceOutcome(metrics, webinar);
  const values = {
    ...summary, ...outcome,
    googleBudgetRate: metrics.length ? outcomeRatio(summary.googleSpend, budget) : null,
    metaBudgetRate: metrics.length ? outcomeRatio(summary.metaSpend, budget) : null,
    budgetRate: metrics.length ? outcomeRatio(summary.spend, budget) : null,
    googleLeadCost: metrics.length && summary.googleAdLeads > 0 ? summary.googleSpend / summary.googleAdLeads : null,
    metaLeadCost: metrics.length && summary.metaAdLeads > 0 ? summary.metaSpend / summary.metaAdLeads : null,
    instagram: metrics.length ? organic.instagram : null, youtube: metrics.length ? organic.youtube : null, unknown: metrics.length ? organic.unknown : null,
    googleSpend: metrics.length ? summary.googleSpend : null, metaSpend: metrics.length ? summary.metaSpend : null,
    googleAdLeads: metrics.length ? summary.googleAdLeads : null, metaAdLeads: metrics.length ? summary.metaAdLeads : null,
    adLeads: metrics.length ? summary.adLeads : null, organicLandingLeads: metrics.length ? summary.organicLandingLeads : null,
    latestChatRoomMembers: [...metrics].sort((a, b) => a.metricDate.localeCompare(b.metricDate)).findLast((item) => item.chatRoomMembers !== null)?.chatRoomMembers ?? null,
  };
  return Object.fromEntries(bulkMetricDefinitions.map(({ key }) => [key, values[key]])) as BulkValues;
}

export function formatBulkValue(value: number | null, unit: Definition["unit"]) {
  return value === null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: unit === "배" ? 2 : unit === "%" ? 1 : 0 })}${unit}`;
}

export function compareBulkMetric(definition: Definition, left: number | null, right: number | null) {
  if (left === null || right === null) return { status: "missing", label: "비교 불가", delta: null } as const;
  // Compare the same precision users see; sub-won rounding must not claim improvement.
  const digits = definition.unit === "배" ? 2 : definition.unit === "%" ? 1 : 0;
  const delta = Number((Number(right.toFixed(digits)) - Number(left.toFixed(digits))).toFixed(digits));
  if (delta === 0) return { status: "same", label: "동일", delta } as const;
  const change = `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("ko-KR", { maximumFractionDigits: digits })}${definition.unit === "%" ? "%p" : definition.unit}`;
  const relative = left > 0 && definition.unit !== "%" && definition.unit !== "배"
    ? ` (${delta > 0 ? "+" : ""}${(delta / left * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%)` : "";
  const status = definition.direction === "neutral" ? "neutral" : (definition.direction === "higher" ? delta > 0 : delta < 0) ? "improved" : "weakened";
  return { status, label: `${status === "improved" ? "개선" : status === "weakened" ? "약화" : "변화"} ${change}${relative}`, delta };
}

export function bulkComparisonNarrative(left: AdPerformanceBulkRow, right: AdPerformanceBulkRow) {
  const describe = (key: BulkMetricKey) => {
    const definition = bulkMetricDefinitions.find((item) => item.key === key)!;
    const result = compareBulkMetric(definition, left.values[key], right.values[key]);
    if (result.status === "missing") return `${definition.label} 지표는 입력값이 부족해 비교할 수 없습니다.`;
    const values = `${definition.label} 지표는 기준 ${formatBulkValue(left.values[key], definition.unit)}, 비교 ${formatBulkValue(right.values[key], definition.unit)}`;
    if (result.status === "same") return `${values}이며 값이 같습니다.`;
    const amount = formatBulkValue(Math.abs(result.delta!), definition.unit).replace(/%$/u, "%p");
    return `${values}입니다. ${amount} ${result.delta! > 0 ? "증가" : "감소"}했으며 ${result.status === "neutral" ? "집행 규모 변화로 분류합니다" : result.status === "improved" ? "개선된 항목입니다" : "약화된 항목입니다"}.`;
  };
  return [
    `${left.name} 대비 ${right.name}의 누적 성과를 비교했습니다.`,
    `${describe("spend")} ${describe("databaseLeads")} ${describe("adLeadCost")}`,
    `${describe("chatMembers")} ${describe("chatToDb")}`,
    `${describe("livePeak")} ${describe("liveToChat")}`,
    `${describe("payments")} ${describe("paymentToLive")}`,
    `${describe("revenue")} ${describe("revenueMultiple")}`,
    `집계 기간은 기준 ${left.startDate} ~ ${left.endDate ?? "기록 없음"}, 비교 ${right.startDate} ~ ${right.endDate ?? "기록 없음"}입니다. 집행 규모와 기간이 다르면 인원·건수의 증감과 전환율·단가의 변화를 함께 확인하세요.`,
  ];
}
