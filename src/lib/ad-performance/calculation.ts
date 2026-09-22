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
    result.impressions += metric.googleImpressions + metric.metaImpressions;
    result.clicks += metric.googleClicks + metric.metaClicks;
    result.adLeads += metric.googleAdLeads + metric.metaAdLeads;
    result.spend += metric.googleSpend + metric.metaSpend;
    result.landingLeads += metric.landingLeads;
    result.adminLeads += metric.googleAdminLeads + metric.metaAdminLeads;
    return result;
  }, { impressions: 0, clicks: 0, adLeads: 0, spend: 0, landingLeads: 0, adminLeads: 0 });

  return {
    ...total,
    remainingBudget: totalBudget - total.spend,
    clickThroughRate: ratio(total.clicks, total.impressions),
    landingConversionRate: ratio(total.landingLeads, total.clicks),
    adLeadCost: unitCost(total.spend, total.adLeads),
    landingLeadCost: unitCost(total.spend, total.landingLeads),
  };
}
