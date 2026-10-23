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
      landingReceptionDb: metric.paidLandingLeads,
      chatRoomEntrants: metric.chatRoomEntrants,
      chatRoomCumulative: metric.chatRoomMembers,
      adDbUnitCost: unitCost(metric.totalSpend, adLeads),
      googleLandingDbUnitCost: metric.googleLandingLeadCost,
      metaLandingDbUnitCost: metric.metaLandingLeadCost,
      landingReceptionDbUnitCost: metric.totalLandingLeadCost,
      chatReceptionDbUnitCost: metric.chatRoomEntrantCost,
    };
  });
}

export type ExternalMarketingReportRow = ReturnType<typeof buildExternalMarketingReportRows>[number];

export function buildExternalMarketingReportTotalRow(
  metrics: AdPerformanceDailyMetric[],
): ExternalMarketingReportRow {
  const daily = calculateDailyAdSpend(metrics);
  const totals = metrics.reduce((result, metric) => {
    result.googleImpressions += metric.googleImpressions;
    result.metaImpressions += metric.metaImpressions;
    result.googleClicks += metric.googleClicks;
    result.metaClicks += metric.metaClicks;
    result.googleAdLeads += metric.googleAdLeads;
    result.metaAdLeads += metric.metaAdLeads;
    result.googleSpend += metric.googleSpend;
    result.metaSpend += metric.metaSpend;
    result.googleLandingLeads += metric.googleLandingLeads;
    result.metaLandingLeads += metric.metaLandingLeads;
    return result;
  }, {
    googleImpressions: 0,
    metaImpressions: 0,
    googleClicks: 0,
    metaClicks: 0,
    googleAdLeads: 0,
    metaAdLeads: 0,
    googleSpend: 0,
    metaSpend: 0,
    googleLandingLeads: 0,
    metaLandingLeads: 0,
  });
  const impressions = totals.googleImpressions + totals.metaImpressions;
  const clicks = totals.googleClicks + totals.metaClicks;
  const adLeads = totals.googleAdLeads + totals.metaAdLeads;
  const spend = totals.googleSpend + totals.metaSpend;
  const landingReceptionDb = totals.googleLandingLeads + totals.metaLandingLeads;
  const latestChatRoomMetric = daily.findLast((metric) => metric.chatRoomMembers !== null);
  const chatRoomEntrants = latestChatRoomMetric?.chatRoomEntrants ?? null;
  const chatRoomCumulative = latestChatRoomMetric?.chatRoomMembers ?? null;

  return {
    metricDate: "전체",
    impressions,
    clicks,
    clickConversionRate: ratio(clicks, impressions),
    landingConversionRate: ratio(landingReceptionDb, clicks),
    spend,
    landingReceptionDb,
    chatRoomEntrants,
    chatRoomCumulative,
    adDbUnitCost: unitCost(spend, adLeads),
    googleLandingDbUnitCost: unitCost(totals.googleSpend, totals.googleLandingLeads),
    metaLandingDbUnitCost: unitCost(totals.metaSpend, totals.metaLandingLeads),
    landingReceptionDbUnitCost: unitCost(spend, landingReceptionDb),
    chatReceptionDbUnitCost: unitCost(spend, chatRoomCumulative ?? 0),
  };
}
