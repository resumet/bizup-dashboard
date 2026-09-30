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
  googleLandingLeads: number;
  metaLandingLeads: number;
  adminCumulativeLeads: number;
  chatRoomMembers: number | null;
  organicLeads: Record<string, number>;
};

export type AdPerformanceOrganicChannel = {
  id: string;
  name: string;
  sortOrder: number;
};

export type AdPerformanceSheetManualInput = {
  bizupDbCumulative: number | null;
  chatMembersCumulative: number | null;
};

export type AdPerformanceTrackingDailyValues = {
  fullDate: string;
  googleLandingDb: number;
  metaLandingDb: number;
  organicByChannel: Record<string, number>;
};

export type AdPerformanceTrackingImport = {
  dailyByDate: Record<string, AdPerformanceTrackingDailyValues>;
  organicChannels: string[];
  matchedRowCount: number;
};

export type AdPerformanceSheetState = {
  spreadsheetUrl: string;
  spreadsheetId: string;
  sheetName: string;
  sourceRows: string[][];
  trackingFileName: string | null;
  tracking: AdPerformanceTrackingImport | null;
  manualInputs: Record<string, AdPerformanceSheetManualInput>;
  version: number;
  updatedAt: string;
};

export type AdPerformanceDashboardData = {
  id: string;
  course: AdPerformanceCourse;
  startDate: string;
  totalBudget: number;
  organicChannels: AdPerformanceOrganicChannel[];
  metrics: AdPerformanceDailyMetric[];
  sheetState: AdPerformanceSheetState | null;
  loadError?: string;
};

export type AdPerformanceCourse = {
  id: string;
  name: string;
  instructorName: string;
  startsAt: string;
};

export type AdPerformanceDashboardSummary = {
  id: string;
  course: AdPerformanceCourse;
  startDate: string;
  totalBudget: number;
  metricCount: number;
  spend: number;
  adLeads: number;
  paidLandingLeads: number;
  organicLandingLeads: number;
  adminCumulativeLeads: number;
  updatedAt: string;
};

export type AdPerformanceIndexData = {
  dashboards: AdPerformanceDashboardSummary[];
  courses: AdPerformanceCourse[];
  loadError?: string;
};

export type AdPerformanceSummary = {
  impressions: number;
  clicks: number;
  adLeads: number;
  spend: number;
  googleSpend: number;
  metaSpend: number;
  googleImpressions: number;
  metaImpressions: number;
  googleClicks: number;
  metaClicks: number;
  googleAdLeads: number;
  metaAdLeads: number;
  paidLandingLeads: number;
  organicLandingLeads: number;
  totalDatabaseLeads: number;
  adminCumulativeLeads: number;
  chatRoomEntrants: number;
  chatRoomEntrantCost: number | null;
  remainingBudget: number;
  googleClickConversionRate: number | null;
  metaClickConversionRate: number | null;
  googleLandingConversionRate: number | null;
  metaLandingConversionRate: number | null;
  adLeadCost: number | null;
  paidLandingLeadCost: number | null;
};
