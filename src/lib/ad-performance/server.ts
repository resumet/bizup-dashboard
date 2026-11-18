import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCreativeData } from "@/lib/ad-creative/server";
import { summarizeCourseTrafficRates } from "@/lib/ad-creative/media-summary";
import { loadAdPerformanceSheetState } from "./sheet-server";
import { currentSeoulDate } from "./sheet-workspace";
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
  free_kakao_room_1_link?: string | null;
  free_kakao_room_2_link?: string | null;
  status?: string | null;
  id: string;
  name: string;
  instructor_name: string;
  starts_at: string;
  free_webinar_at?: string;
};

type DashboardRow = {
  applicant_list_url?: string;
  id: string;
  course_id: string | null;
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

type ChatRoomMetricRow = {
  dashboard_id: string;
  metric_date: string;
  chat_room_members: number | string | null;
};

const metricColumns = "dashboard_id,metric_date,google_impressions,meta_impressions,google_clicks,meta_clicks,google_ad_leads,meta_ad_leads,google_spend,meta_spend,google_landing_leads,meta_landing_leads,admin_cumulative_leads,chat_room_members";

function toCourse(row: CourseRow): AdPerformanceCourse {
  return {
    id: row.id,
    name: row.name,
    instructorName: row.instructor_name,
    status: row.status,
    startsAt: row.starts_at,
    freeWebinarAt: row.free_webinar_at,
    freeKakaoRoom1Link: row.free_kakao_room_1_link ?? "",
    freeKakaoRoom2Link: row.free_kakao_room_2_link ?? "",
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
  const [coursesResult, dashboardsResult, creative] = await Promise.all([
    admin.from("courses").select("id,name,status,instructor_name,instructor_nickname,starts_at,free_webinar_at,free_kakao_room_1_link,free_kakao_room_2_link").eq("workspace_id", workspaceId).order("starts_at", { ascending: false }),
    admin.from("ad_performance_dashboard_summaries").select("id,course_id,start_date,total_budget,updated_at,metric_count,spend,ad_leads,paid_landing_leads,organic_landing_leads,admin_cumulative_leads").eq("workspace_id", workspaceId).eq("service_scope", "bizup").order("updated_at", { ascending: false }),
    loadCreativeData(workspaceId),
  ]);
  const creativeSource = { url: creative.url, webinarName: creative.webinarName, updatedAt: creative.updatedAt };
  if (coursesResult.error) throw new Error(`강의 목록 조회 실패: ${coursesResult.error.code}`);
  if (isMissingMigration(dashboardsResult.error)) {
    return {
      courses: sortByNearestWebinar((coursesResult.data ?? []) as CourseRow[]).map(toCourse),
      dashboards: [],
      creativeSource,
      loadError: "강의별 광고성과 DB 마이그레이션(202609230005)을 먼저 적용해 주세요.",
    };
  }
  if (dashboardsResult.error) throw new Error(`광고성과 목록 조회 실패: ${dashboardsResult.error.code}`);

  const rows = (dashboardsResult.data ?? []) as DashboardRow[];
  const dashboardIds = rows.map((row) => row.id);
  const chatRoomMetricsResult = dashboardIds.length
    ? await admin.from("ad_performance_dashboard_metrics").select("dashboard_id,metric_date,chat_room_members").in("dashboard_id", dashboardIds).order("metric_date", { ascending: true })
    : { data: [], error: null };
  if (chatRoomMetricsResult.error) throw new Error(`단톡방 인원 조회 실패: ${chatRoomMetricsResult.error.code}`);
  const chatRoomMembersByDashboard = new Map<string, number>();
  for (const metric of (chatRoomMetricsResult.data ?? []) as ChatRoomMetricRow[]) {
    if (metric.chat_room_members !== null) chatRoomMembersByDashboard.set(metric.dashboard_id, Number(metric.chat_room_members));
  }
  const courseRows = sortByNearestWebinar(coursesResult.data ?? []);
  const courses = courseRows.map(toCourse);
  const courseMap = new Map(courseRows.map((course) => [course.id, course]));
  const dashboards = rows.map<AdPerformanceDashboardSummary>((row) => {
    const course = row.course_id ? courseMap.get(row.course_id) ?? null : null;
    return {
      id: row.id,
      course: course ? toCourse(course) : null,
      trafficRates: creative.url && course?.instructor_nickname ? summarizeCourseTrafficRates(creative.rows, course.instructor_nickname) : null,
      startDate: row.start_date,
      totalBudget: Number(row.total_budget),
      metricCount: Number(row.metric_count ?? 0),
      spend: Number(row.spend ?? 0),
      adLeads: Number(row.ad_leads ?? 0),
      paidLandingLeads: Number(row.paid_landing_leads ?? 0),
      organicLandingLeads: Number(row.organic_landing_leads ?? 0),
      adminCumulativeLeads: Number(row.admin_cumulative_leads ?? 0),
      chatRoomMembers: chatRoomMembersByDashboard.get(row.id) ?? null,
      updatedAt: row.updated_at,
    };
  });
  const courseOrder = new Map(courses.map((course, index) => [course.id, index]));
  dashboards.sort((a, b) => (courseOrder.get(a.course?.id ?? "") ?? Infinity) - (courseOrder.get(b.course?.id ?? "") ?? Infinity));
  return { courses, dashboards, creativeSource };
}

export async function loadAdPerformanceDashboard(
  workspaceId: string,
  dashboardId: string,
  serviceScope: "bizup" | "external_marketing" = "bizup",
): Promise<AdPerformanceDashboardData | null> {
  const admin = createAdminClient();
  const dashboardResult = await admin
    .from("ad_performance_dashboards")
    .select("id,course_id,start_date,total_budget,updated_at,applicant_list_url")
    .eq("workspace_id", workspaceId)
    .eq("service_scope", serviceScope)
    .eq("id", dashboardId)
    .maybeSingle();
  if (isMissingMigration(dashboardResult.error)) return null;
  if (dashboardResult.error) throw new Error(`광고성과 조회 실패: ${dashboardResult.error.code}`);
  if (!dashboardResult.data) return null;
  const dashboard = dashboardResult.data as DashboardRow;
  const exclusiveEndDate = currentSeoulDate();
  const [coursesResult, linkedDashboardsResult, metricsResult, channelsResult, organicValuesResult, sheetState] = await Promise.all([
    admin.from("courses").select("id,name,status,instructor_name,starts_at,free_webinar_at,free_kakao_room_1_link,free_kakao_room_2_link").eq("workspace_id", workspaceId).order("starts_at", { ascending: false }),
    admin.from("ad_performance_dashboards").select("course_id").eq("workspace_id", workspaceId).neq("id", dashboardId),
    admin.from("ad_performance_dashboard_metrics").select(metricColumns).eq("dashboard_id", dashboardId).order("metric_date", { ascending: true }),
    admin.from("ad_performance_organic_channels").select("id,name,sort_order").eq("dashboard_id", dashboardId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("ad_performance_organic_metric_values").select("channel_id,metric_date,lead_count").eq("dashboard_id", dashboardId),
    loadAdPerformanceSheetState(dashboardId, dashboard.start_date),
  ]);
  if (coursesResult.error) throw new Error(`강의 목록 조회 실패: ${coursesResult.error.code}`);
  if (linkedDashboardsResult.error) throw new Error(`연결 강의 조회 실패: ${linkedDashboardsResult.error.code}`);
  if (metricsResult.error) throw new Error(`광고성과 지표 조회 실패: ${metricsResult.error.code}`);
  if (channelsResult.error) throw new Error(`오가닉 채널 조회 실패: ${channelsResult.error.code}`);
  if (organicValuesResult.error) throw new Error(`오가닉 DB 조회 실패: ${organicValuesResult.error.code}`);
  const organicByDate = new Map<string, Record<string, number>>();
  for (const value of (organicValuesResult.data ?? []) as OrganicValueRow[]) {
    const values = organicByDate.get(value.metric_date) ?? {};
    values[value.channel_id] = Number(value.lead_count);
    organicByDate.set(value.metric_date, values);
  }
  const linkedCourseIds = new Set(
    (linkedDashboardsResult.data ?? []).flatMap((item) =>
      typeof item.course_id === "string" ? [item.course_id] : [],
    ),
  );
  const courses = sortByNearestWebinar((coursesResult.data ?? []) as CourseRow[])
    .map(toCourse)
    .filter((item) => item.id === dashboard.course_id || !linkedCourseIds.has(item.id));
  const course = dashboard.course_id
    ? courses.find((item) => item.id === dashboard.course_id) ?? null
    : null;
  if (dashboard.course_id && !course) throw new Error("연결된 강의를 찾을 수 없습니다.");
  return {
    id: dashboard.id,
    applicantListUrl: dashboard.applicant_list_url ?? "",
    course,
    courses,
    startDate: dashboard.start_date,
    totalBudget: Number(dashboard.total_budget),
    organicChannels: ((channelsResult.data ?? []) as OrganicChannelRow[]).map<AdPerformanceOrganicChannel>((channel) => ({
      id: channel.id,
      name: channel.name,
      sortOrder: channel.sort_order,
    })),
    metrics: ((metricsResult.data ?? []) as MetricRow[])
      .filter((metric) => metric.metric_date < exclusiveEndDate)
      .map((metric) =>
        toAdPerformanceMetric(
          metric,
          organicByDate.get(metric.metric_date) ?? {},
        ),
      ),
    sheetState,
  };
}
