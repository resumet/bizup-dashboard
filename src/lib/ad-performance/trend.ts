import { calculateDailyAdSpend } from "./calculation";
import type { AdPerformanceDailyMetric } from "./types";

export function adPerformanceTrend(metrics: AdPerformanceDailyMetric[]) {
  return calculateDailyAdSpend(metrics).map((row) => {
    const adLeads = row.googleAdLeads + row.metaAdLeads;
    return {
      date: row.metricDate,
      adLeads,
      adLeadCost: adLeads > 0 ? row.totalSpend / adLeads : null,
      landingLeadCost: row.totalLandingLeadCost,
      chatMembers: row.chatRoomMembers,
    };
  });
}
