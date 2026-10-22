import { summarizeAdPerformance } from "./calculation";
import type { AdPerformanceDailyMetric } from "./types";
import type { WebinarMetrics } from "@/lib/course-webinars/metrics";

export type AdPerformanceWebinarOutcome = Pick<WebinarMetrics, "ad_spend" | "group_chat_count" | "live_peak_count" | "payment_count" | "revenue">;

export function outcomeRatio(value: number | null | undefined, base: number | null | undefined, multiple = false) {
  return value == null || base == null || base <= 0 ? null : value / base * (multiple ? 1 : 100);
}

function comparison(value: number | null | undefined, base: number | null | undefined, multiple = false) {
  if (value == null || base == null || base <= 0) return "계산 불가";
  const result = value / base * (multiple ? 1 : 100);
  return `${result.toLocaleString("ko-KR", { maximumFractionDigits: multiple ? 2 : 1 })}${multiple ? "배" : "%"}`;
}

export function getAdPerformanceOutcome(metrics: AdPerformanceDailyMetric[], webinar: AdPerformanceWebinarOutcome | null) {
  const summary = summarizeAdPerformance(metrics, 0);
  const chatMembers = webinar?.group_chat_count
    ?? [...metrics].sort((a, b) => a.metricDate.localeCompare(b.metricDate)).findLast((row) => row.chatRoomMembers !== null)?.chatRoomMembers
    ?? null;
  const spend = metrics.length ? summary.spend : webinar?.ad_spend ?? null;
  const databaseLeads = metrics.length ? summary.totalDatabaseLeads : null;
  const livePeak = webinar?.live_peak_count ?? null;
  const payments = webinar?.payment_count ?? null;
  const revenue = webinar?.revenue ?? null;
  return { spend, databaseLeads, chatMembers, livePeak, payments, revenue,
    chatToDb: outcomeRatio(chatMembers, databaseLeads), liveToDb: outcomeRatio(livePeak, databaseLeads),
    liveToChat: outcomeRatio(livePeak, chatMembers), paymentToDb: outcomeRatio(payments, databaseLeads),
    paymentToChat: outcomeRatio(payments, chatMembers), paymentToLive: outcomeRatio(payments, livePeak),
    revenueMultiple: outcomeRatio(revenue, spend, true) };
}

export function adPerformanceOutcomeSummary(metrics: AdPerformanceDailyMetric[], webinar: AdPerformanceWebinarOutcome | null) {
  const { spend, databaseLeads, chatMembers, livePeak, payments, revenue } = getAdPerformanceOutcome(metrics, webinar);
  const format = (value: number | null | undefined, unit: string) => value == null ? "미입력" : `${value.toLocaleString("ko-KR")}${unit}`;
  return [
    spend == null ? "광고비는 미입력입니다." : `광고비 ${format(spend, "원")}을 집행했습니다.`,
    databaseLeads === null ? "접수 DB는 미입력이며," : `DB는 총 ${format(databaseLeads, "건")} 접수되었고,`,
    chatMembers === null ? "톡방 입장 인원은 미입력입니다." : `톡방에는 ${format(chatMembers, "명")} (DB 대비 ${comparison(chatMembers, databaseLeads)})이 입장했습니다.`,
    livePeak == null ? "라이브 최대 인원은 미입력이며," : `라이브에는 최대 ${format(livePeak, "명")} (DB 대비 ${comparison(livePeak, databaseLeads)}, 톡방 대비 ${comparison(livePeak, chatMembers)})이 참여했고,`,
    payments == null ? "결제 건수는 미입력이며," : `결제는 ${format(payments, "건")} (DB 대비 ${comparison(payments, databaseLeads)}, 톡방 대비 ${comparison(payments, chatMembers)}, 라이브 대비 ${comparison(payments, livePeak)}) 이루어졌으며,`,
    revenue == null ? "매출은 미입력입니다." : `총 ${format(revenue, "원")} (광고비 대비 ${comparison(revenue, spend, true)})의 매출을 기록했습니다.`,
  ].join(" ");
}
