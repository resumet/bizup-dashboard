import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdPerformanceCourse,
  AdPerformanceDailyMetric,
  AdPerformanceDashboardData,
  AdPerformanceDashboardSummary,
  AdPerformanceIndexData,
  AdPerformanceOrganicChannel,
} from "./types";

type MetricRow = {
  dashboard_id?: string;
  metric_date: string;
  google_impressions: number | string;
  meta_impressions: number | string;
  google_clicks: number | string;
  meta_clicks: number | string;
  google_ad_leads: number | string;
  meta_ad_leads: number | string;
  google_spend: number | string;
  meta_spend: number | string;
  google_landing_leads: number | string;
  meta_landing_leads: number | string;
  admin_cumulative_leads: number | string;
  chat_room_members?: number | string | null;
};

type OrganicChannelRow = { id: string; name: string; sort_order: number };
type OrganicValueRow = { channel_id: string; metric_date: string; lead_count: number | string };

type CourseRow = {
  id: string;
  name: string;
  instructor_name: string;
  starts_at: string;
};

type DashboardRow = {
  id: string;
  course_id: string;
  start_date: string;
  total_budget: number | string;
  updated_at: string;
  metric_count?: number | string;
  spend?: number | string;
  ad_leads?: number | string;
  paid_landing_leads?: number | string;
  organic_landing_leads?: number | string;
  admin_cumulative_leads?: number | string;
};

const metricColumns = "dashboard_id,metric_date,google_impressions,meta_impressions,google_clicks,meta_clicks,google_ad_leads,meta_ad_leads,google_spend,meta_spend,google_landing_leads,meta_landing_leads,admin_cumulative_leads,chat_room_members";

function toCourse(row: CourseRow): AdPerformanceCourse {
  return {
    id: row.id,
    name: row.name,
    instructorName: row.instructor_name,
    startsAt: row.starts_at,
  };
}

export function toAdPerformanceMetric(row: MetricRow, organicLeads: Record<string, number> = {}): AdPerformanceDailyMetric {
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
    googleLandingLeads: Number(row.google_landing_leads),
    metaLandingLeads: Number(row.meta_landing_leads),
    adminCumulativeLeads: Number(row.admin_cumulative_leads),
    chatRoomMembers: row.chat_room_members == null ? null : Number(row.chat_room_members),
    organicLeads,
  };
}

function isMissingMigration(error: { code?: string } | null | undefined) {
  return Boolean(error && /PGRST20[45]|42P01/u.test(error.code ?? ""));
}

export async function loadAdPerformanceIndex(workspaceId: string): Promise<AdPerformanceIndexData> {
  const admin = createAdminClient();
  const [coursesResult, dashboardsResult] = await Promise.all([
    admin.from("courses").select("id,name,instructor_name,starts_at").eq("workspace_id", workspaceId).order("starts_at", { ascending: false }),
    admin.from("ad_performance_dashboard_summaries").select("id,course_id,start_date,total_budget,updated_at,metric_count,spend,ad_leads,paid_landing_leads,organic_landing_leads,admin_cumulative_leads").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
  ]);
  if (coursesResult.error) throw new Error(`강의 목록 조회 실패: ${coursesResult.error.code}`);
  if (isMissingMigration(dashboardsResult.error)) {
    return {
      courses: ((coursesResult.data ?? []) as CourseRow[]).map(toCourse),
      dashboards: [],
      loadError: "강의별 광고성과 DB 마이그레이션(202609230005)을 먼저 적용해 주세요.",
    };
  }
  if (dashboardsResult.error) throw new Error(`광고성과 목록 조회 실패: ${dashboardsResult.error.code}`);

  const rows = (dashboardsResult.data ?? []) as DashboardRow[];
  const courses = ((coursesResult.data ?? []) as CourseRow[]).map(toCourse);
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const dashboards = rows.flatMap<AdPerformanceDashboardSummary>((row) => {
    const course = courseMap.get(row.course_id);
    if (!course) return [];
    return [{
      id: row.id,
      course,
      startDate: row.start_date,
      totalBudget: Number(row.total_budget),
      metricCount: Number(row.metric_count ?? 0),
      spend: Number(row.spend ?? 0),
      adLeads: Number(row.ad_leads ?? 0),
      paidLandingLeads: Number(row.paid_landing_leads ?? 0),
      organicLandingLeads: Number(row.organic_landing_leads ?? 0),
      adminCumulativeLeads: Number(row.admin_cumulative_leads ?? 0),
      updatedAt: row.updated_at,
    }];
  });
  return { courses, dashboards };
}

export async function loadAdPerformanceDashboard(
  workspaceId: string,
  dashboardId: string,
): Promise<AdPerformanceDashboardData | null> {
  const admin = createAdminClient();
  const dashboardResult = await admin
    .from("ad_performance_dashboards")
    .select("id,course_id,start_date,total_budget,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", dashboardId)
    .maybeSingle();
  if (isMissingMigration(dashboardResult.error)) return null;
  if (dashboardResult.error) throw new Error(`광고성과 조회 실패: ${dashboardResult.error.code}`);
  if (!dashboardResult.data) return null;
  const dashboard = dashboardResult.data as DashboardRow;
  const [courseResult, metricsResult, channelsResult, organicValuesResult] = await Promise.all([
    admin.from("courses").select("id,name,instructor_name,starts_at").eq("workspace_id", workspaceId).eq("id", dashboard.course_id).maybeSingle(),
    admin.from("ad_performance_dashboard_metrics").select(metricColumns).eq("dashboard_id", dashboardId).order("metric_date", { ascending: true }),
    admin.from("ad_performance_organic_channels").select("id,name,sort_order").eq("dashboard_id", dashboardId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("ad_performance_organic_metric_values").select("channel_id,metric_date,lead_count").eq("dashboard_id", dashboardId),
  ]);
  if (courseResult.error || !courseResult.data) throw new Error(`연결된 강의 조회 실패: ${courseResult.error?.code ?? "NOT_FOUND"}`);
  if (metricsResult.error) throw new Error(`광고성과 지표 조회 실패: ${metricsResult.error.code}`);
  if (channelsResult.error) throw new Error(`오가닉 채널 조회 실패: ${channelsResult.error.code}`);
  if (organicValuesResult.error) throw new Error(`오가닉 DB 조회 실패: ${organicValuesResult.error.code}`);
  const organicByDate = new Map<string, Record<string, number>>();
  for (const value of (organicValuesResult.data ?? []) as OrganicValueRow[]) {
    const values = organicByDate.get(value.metric_date) ?? {};
    values[value.channel_id] = Number(value.lead_count);
    organicByDate.set(value.metric_date, values);
  }
  return {
    id: dashboard.id,
    course: toCourse(courseResult.data as CourseRow),
    startDate: dashboard.start_date,
    totalBudget: Number(dashboard.total_budget),
    organicChannels: ((channelsResult.data ?? []) as OrganicChannelRow[]).map<AdPerformanceOrganicChannel>((channel) => ({
      id: channel.id,
      name: channel.name,
      sortOrder: channel.sort_order,
    })),
    metrics: ((metricsResult.data ?? []) as MetricRow[]).map((metric) => toAdPerformanceMetric(metric, organicByDate.get(metric.metric_date) ?? {})),
  };
}
