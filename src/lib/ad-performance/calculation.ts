import type { AdPerformanceDailyMetric, AdPerformanceSummary } from "./types";

export function calculateDailyAdSpend(metrics: AdPerformanceDailyMetric[]) {
  let cumulativeSpend = 0;
  const membersByDate = new Map(metrics.map(metric => [metric.metricDate, metric.chatRoomMembers]));
  return [...metrics].sort((a, b) => a.metricDate.localeCompare(b.metricDate)).map((metric) => {
    const totalSpend = metric.googleSpend + metric.metaSpend;
    cumulativeSpend += totalSpend;
    const previousDate = new Date(`${metric.metricDate}T00:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const previousMembers = membersByDate.get(previousDate.toISOString().slice(0, 10));
    const chatRoomEntrants = metric.chatRoomMembers != null && previousMembers != null
      ? metric.chatRoomMembers - previousMembers : null;
    const googleAdLeadCost = unitCost(metric.googleSpend, metric.googleAdLeads);
    const metaAdLeadCost = unitCost(metric.metaSpend, metric.metaAdLeads);
    const googleLandingLeadCost = unitCost(metric.googleSpend, metric.googleLandingLeads);
    const metaLandingLeadCost = unitCost(metric.metaSpend, metric.metaLandingLeads);
    return {
      ...metric, totalSpend, cumulativeSpend,
      googleAdLeadCost, metaAdLeadCost, googleLandingLeadCost, metaLandingLeadCost,
      googleLeadCostDifference: googleLandingLeadCost !== null && googleAdLeadCost !== null ? googleLandingLeadCost - googleAdLeadCost : null,
      metaLeadCostDifference: metaLandingLeadCost !== null && metaAdLeadCost !== null ? metaLandingLeadCost - metaAdLeadCost : null,
      chatRoomEntrants,
      chatRoomLeadCost: chatRoomEntrants === null ? null : unitCost(totalSpend, chatRoomEntrants),
      totalLandingLeadCost: unitCost(totalSpend, metric.googleLandingLeads + metric.metaLandingLeads),
    };
  });
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator * 100 : null;
}

function unitCost(amount: number, count: number) {
  return count > 0 ? amount / count : null;
}

export function summarizeAdPerformance(
  metrics: AdPerformanceDailyMetric[],
  totalBudget: number,
): AdPerformanceSummary {
  const total = metrics.reduce((result, metric) => {
    result.googleImpressions += metric.googleImpressions;
    result.metaImpressions += metric.metaImpressions;
    result.googleClicks += metric.googleClicks;
    result.metaClicks += metric.metaClicks;
    result.googleAdLeads += metric.googleAdLeads;
    result.metaAdLeads += metric.metaAdLeads;
    result.spend += metric.googleSpend + metric.metaSpend;
    result.googleSpend += metric.googleSpend;
    result.metaSpend += metric.metaSpend;
    result.paidLandingLeads += metric.googleLandingLeads + metric.metaLandingLeads;
    result.organicLandingLeads += Object.values(metric.organicLeads).reduce((sum, value) => sum + value, 0);
    return result;
  }, {
    googleImpressions: 0,
    metaImpressions: 0,
    googleClicks: 0,
    metaClicks: 0,
    googleAdLeads: 0,
    metaAdLeads: 0,
    spend: 0,
    googleSpend: 0,
    metaSpend: 0,
    paidLandingLeads: 0,
    organicLandingLeads: 0,
  });
  const impressions = total.googleImpressions + total.metaImpressions;
  const clicks = total.googleClicks + total.metaClicks;
  const adLeads = total.googleAdLeads + total.metaAdLeads;
  const latestMetric = [...metrics].sort((a, b) => b.metricDate.localeCompare(a.metricDate))[0];

  return {
    ...total,
    impressions,
    clicks,
    adLeads,
    totalDatabaseLeads: total.paidLandingLeads + total.organicLandingLeads,
    adminCumulativeLeads: latestMetric?.adminCumulativeLeads ?? 0,
    remainingBudget: totalBudget - total.spend,
    googleClickConversionRate: ratio(total.googleClicks, total.googleImpressions),
    metaClickConversionRate: ratio(total.metaClicks, total.metaImpressions),
    googleLandingConversionRate: ratio(total.googleAdLeads, total.googleClicks),
    metaLandingConversionRate: ratio(total.metaAdLeads, total.metaClicks),
    adLeadCost: unitCost(total.spend, adLeads),
    paidLandingLeadCost: unitCost(total.spend, total.paidLandingLeads),
  };
}
