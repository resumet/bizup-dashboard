import { calculateDailyAdSpend } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function unitCost(amount: number, count: number) {
  return count > 0 ? amount / count : null;
}

export function buildExternalMarketingReportRows(metrics: AdPerformanceDailyMetric[]) {
  return calculateDailyAdSpend(metrics).map((metric) => {
    const impressions = metric.googleImpressions + metric.metaImpressions;
    const clicks = metric.googleClicks + metric.metaClicks;
    const adLeads = metric.googleAdLeads + metric.metaAdLeads;
    return {
      metricDate: metric.metricDate,
      impressions,
      clicks,
      clickConversionRate: ratio(clicks, impressions),
      landingConversionRate: ratio(metric.paidLandingLeads, clicks),
      spend: metric.totalSpend,
      adDbUnitCost: unitCost(metric.totalSpend, adLeads),
      googleLandingDbUnitCost: metric.googleLandingLeadCost,
      metaLandingDbUnitCost: metric.metaLandingLeadCost,
      landingReceptionDbUnitCost: metric.totalLandingLeadCost,
      chatReceptionDbUnitCost: metric.chatRoomEntrantCost,
    };
  });
}

export type ExternalMarketingReportRow = ReturnType<typeof buildExternalMarketingReportRows>[number];
