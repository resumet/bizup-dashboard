import type { AdPerformanceDailyMetric, AdPerformanceSummary } from "./types";

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
