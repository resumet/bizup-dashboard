import { summarizeAdPerformance } from "./calculation";
import type { AdPerformanceDailyMetric } from "./types";
import type { WebinarMetrics } from "@/lib/course-webinars/metrics";

export type AdPerformanceWebinarOutcome = Pick<WebinarMetrics, "ad_spend" | "group_chat_count" | "live_peak_count" | "payment_count" | "revenue">;

export function adPerformanceOutcomeSummary(metrics: AdPerformanceDailyMetric[], webinar: AdPerformanceWebinarOutcome | null) {
  const summary = summarizeAdPerformance(metrics, 0);
  const chatMembers = webinar?.group_chat_count
    ?? [...metrics].sort((a, b) => a.metricDate.localeCompare(b.metricDate)).findLast((row) => row.chatRoomMembers !== null)?.chatRoomMembers
    ?? null;
  const format = (value: number | null | undefined, unit: string) => value == null ? "미입력" : `${value.toLocaleString("ko-KR")}${unit}`;
  const spend = metrics.length ? summary.spend : webinar?.ad_spend;
  return [
    spend == null ? "광고비는 미입력입니다." : `광고비 ${format(spend, "원")}을 집행했습니다.`,
    metrics.length ? `DB는 총 ${format(summary.totalDatabaseLeads, "건")} 접수되었고,` : "접수 DB는 미입력이며,",
    chatMembers === null ? "톡방 입장 인원은 미입력입니다." : `톡방에는 ${format(chatMembers, "명")}이 입장했습니다.`,
    webinar?.live_peak_count == null ? "라이브 최대 인원은 미입력이며," : `라이브에는 최대 ${format(webinar.live_peak_count, "명")}이 참여했고,`,
    webinar?.payment_count == null ? "결제 건수는 미입력이며," : `결제는 ${format(webinar.payment_count, "건")} 이루어졌으며,`,
    webinar?.revenue == null ? "매출은 미입력입니다." : `총 ${format(webinar.revenue, "원")}의 매출을 기록했습니다.`,
  ].join(" ");
}
