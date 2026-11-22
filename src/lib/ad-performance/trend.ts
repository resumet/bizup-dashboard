import { calculateDailyAdSpend } from "./calculation";
import type { AdPerformanceDailyMetric } from "./types";

export function adPerformanceTrend(metrics: AdPerformanceDailyMetric[]) {
  let cumulativeAdLeads = 0;
  return calculateDailyAdSpend(metrics).map((row) => {
    const adLeads = row.googleAdLeads + row.metaAdLeads;
    cumulativeAdLeads += adLeads;
    return {
      date: row.metricDate,
      adLeads: cumulativeAdLeads,
      adLeadCost: adLeads > 0 ? row.totalSpend / adLeads : null,
      landingLeadCost: row.totalLandingLeadCost,
      chatMembers: row.chatRoomMembers,
    };
  });
}
