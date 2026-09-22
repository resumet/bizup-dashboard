export type AdPerformanceDailyMetric = {
  metricDate: string;
  googleImpressions: number;
  metaImpressions: number;
  googleClicks: number;
  metaClicks: number;
  googleAdLeads: number;
  metaAdLeads: number;
  googleSpend: number;
  metaSpend: number;
  landingLeads: number;
  googleAdminLeads: number;
  metaAdminLeads: number;
};

export type AdPerformanceDashboardData = {
  startDate: string;
  totalBudget: number;
  metrics: AdPerformanceDailyMetric[];
  loadError?: string;
};

export type AdPerformanceSummary = {
  impressions: number;
  clicks: number;
  adLeads: number;
  spend: number;
  landingLeads: number;
  adminLeads: number;
  remainingBudget: number;
  clickThroughRate: number | null;
  landingConversionRate: number | null;
  adLeadCost: number | null;
  landingLeadCost: number | null;
};
