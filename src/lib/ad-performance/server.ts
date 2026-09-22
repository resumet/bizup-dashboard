import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AdPerformanceDailyMetric, AdPerformanceDashboardData } from "./types";

type MetricRow = {
  metric_date: string;
  google_impressions: number | string;
  meta_impressions: number | string;
  google_clicks: number | string;
  meta_clicks: number | string;
  google_ad_leads: number | string;
  meta_ad_leads: number | string;
  google_spend: number | string;
  meta_spend: number | string;
  landing_leads: number | string;
  google_admin_leads: number | string;
  meta_admin_leads: number | string;
};

export function toAdPerformanceMetric(row: MetricRow): AdPerformanceDailyMetric {
  return {
    metricDate: row.metric_date,
    googleImpressions: Number(row.google_impressions),
    metaImpressions: Number(row.meta_impressions),
    googleClicks: Number(row.google_clicks),
    metaClicks: Number(row.meta_clicks),
    googleAdLeads: Number(row.google_ad_leads),
    metaAdLeads: Number(row.meta_ad_leads),
    googleSpend: Number(row.google_spend),
    metaSpend: Number(row.meta_spend),
    landingLeads: Number(row.landing_leads),
    googleAdminLeads: Number(row.google_admin_leads),
    metaAdminLeads: Number(row.meta_admin_leads),
  };
}

export async function loadAdPerformanceDashboard(workspaceId: string): Promise<AdPerformanceDashboardData> {
  const admin = createAdminClient();
  const [settingsResult, metricsResult] = await Promise.all([
    admin.from("ad_performance_settings").select("start_date,total_budget").eq("workspace_id", workspaceId).maybeSingle(),
    admin.from("ad_performance_daily_metrics").select("metric_date,google_impressions,meta_impressions,google_clicks,meta_clicks,google_ad_leads,meta_ad_leads,google_spend,meta_spend,landing_leads,google_admin_leads,meta_admin_leads").eq("workspace_id", workspaceId).order("metric_date", { ascending: false }),
  ]);
  const error = settingsResult.error ?? metricsResult.error;
  if (error && /PGRST20[45]|42P01/u.test(error.code)) {
    return {
      startDate: "",
      totalBudget: 0,
      metrics: [],
      loadError: "광고성과 DB 마이그레이션(202609230004)을 먼저 적용해 주세요.",
    };
  }
  if (error) throw new Error(`광고성과 조회 실패: ${error.code}`);
  return {
    startDate: String(settingsResult.data?.start_date ?? ""),
    totalBudget: Number(settingsResult.data?.total_budget ?? 0),
    metrics: ((metricsResult.data ?? []) as MetricRow[]).map(toAdPerformanceMetric),
  };
}
