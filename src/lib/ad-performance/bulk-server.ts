import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import { loadWebinarPayments } from "@/lib/course-webinars/paid-roster";
import type { AdPerformanceWebinarOutcome } from "./outcome-summary";
import { bulkValues, type AdPerformanceBulkRow } from "./bulk";
import { toAdPerformanceMetric } from "./server";
import { currentSeoulDate } from "./sheet-workspace";
import type { AdPerformanceDailyMetric, AdPerformanceOrganicChannel } from "./types";

export async function readAllPerformanceRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error) throw new Error(`광고성과 일괄 조회 실패: ${error.code ?? "unknown"}`);
    rows.push(...data ?? []);
    if (!data || data.length < 500) return rows;
  }
}

type Dashboard = { id: string; course_id: string | null; start_date: string; total_budget: number | string };
type Course = { id: string; name: string; instructor_name: string; free_webinar_at: string | null };
type External = { dashboard_id: string; course_name: string; instructor_name: string; cohort: string };
type RawMetric = Parameters<typeof toAdPerformanceMetric>[0] & { dashboard_id: string };
type Channel = { id: string; dashboard_id: string; name: string; sort_order: number };
type Organic = { dashboard_id: string; metric_date: string; channel_id: string; lead_count: number };
type Webinar = AdPerformanceWebinarOutcome & { course_id: string };

export async function loadAdPerformanceBulk(workspaceId: string, client: SupabaseClient, admin = createAdminClient()): Promise<AdPerformanceBulkRow[]> {
  const exclusiveEndDate = currentSeoulDate();
  // Resolve workspace ownership first; child reads are limited to those exact IDs.
  const [dashboards, courses, external] = await Promise.all([
    readAllPerformanceRows<Dashboard>((from, to) => admin.from("ad_performance_dashboards").select("id,course_id,start_date,total_budget").eq("workspace_id", workspaceId).order("id").range(from, to)),
    readAllPerformanceRows<Course>((from, to) => admin.from("courses").select("id,name,instructor_name,free_webinar_at").eq("workspace_id", workspaceId).order("id").range(from, to)),
    readAllPerformanceRows<External>((from, to) => admin.from("external_marketing_projects").select("dashboard_id,course_name,instructor_name,cohort").eq("workspace_id", workspaceId).order("dashboard_id").range(from, to)),
  ]);
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const externalMap = new Map(external.map((project) => [project.dashboard_id, project]));
  const courseIds = [...new Set(dashboards.flatMap((row) => row.course_id && courseMap.has(row.course_id) ? [row.course_id] : []))];
  const webinarRows = async () => {
    const rows: Webinar[] = [];
    for (let offset = 0; offset < courseIds.length; offset += 100) {
      rows.push(...await readAllPerformanceRows<Webinar>((from, to) => client.from("course_webinar_metrics")
        .select("course_id,ad_spend,group_chat_count,live_peak_count,payment_count,revenue").in("course_id", courseIds.slice(offset, offset + 100)).order("course_id").range(from, to)));
    }
    return rows;
  };
  const readMetrics = async () => {
    const metrics: RawMetric[] = [], channels: Channel[] = [], organic: Organic[] = [];
    for (let offset = 0; offset < dashboards.length; offset += 100) {
      const ids = dashboards.slice(offset, offset + 100).map((item) => item.id);
      const result = await Promise.all([
        readAllPerformanceRows<RawMetric>((from, to) => admin.from("ad_performance_dashboard_metrics")
          .select("dashboard_id,metric_date,google_impressions,meta_impressions,google_clicks,meta_clicks,google_ad_leads,meta_ad_leads,google_spend,meta_spend,google_landing_leads,meta_landing_leads,admin_cumulative_leads,chat_room_members")
          .in("dashboard_id", ids).lt("metric_date", exclusiveEndDate).order("dashboard_id").order("metric_date").range(from, to)),
        readAllPerformanceRows<Channel>((from, to) => admin.from("ad_performance_organic_channels").select("id,dashboard_id,name,sort_order").in("dashboard_id", ids).order("id").range(from, to)),
        readAllPerformanceRows<Organic>((from, to) => admin.from("ad_performance_organic_metric_values").select("dashboard_id,metric_date,channel_id,lead_count")
          .in("dashboard_id", ids).lt("metric_date", exclusiveEndDate).order("dashboard_id").order("metric_date").order("channel_id").range(from, to)),
      ]);
      metrics.push(...result[0]); channels.push(...result[1]); organic.push(...result[2]);
    }
    return { metrics, channels, organic };
  };
  const [advertising, webinarsResult, paymentsResult] = await Promise.all([
    readMetrics(), webinarRows().then((data) => ({ data, failed: false }), () => ({ data: [] as Webinar[], failed: true })),
    loadWebinarPayments(client, courseIds).then((data) => ({ data, failed: false }), () => ({ data: null, failed: true })),
  ]);
  const webinarMap = new Map(webinarsResult.data.map((row) => [row.course_id, row]));
  const organicMap = new Map<string, Record<string, number>>();
  for (const row of advertising.organic) {
    const key = `${row.dashboard_id}:${row.metric_date}`;
    const values = organicMap.get(key) ?? {};
    values[row.channel_id] = Number(row.lead_count);
    organicMap.set(key, values);
  }
  const metricsMap = new Map<string, AdPerformanceDailyMetric[]>();
  for (const row of advertising.metrics) {
    const values = metricsMap.get(row.dashboard_id) ?? [];
    values.push(toAdPerformanceMetric(row, organicMap.get(`${row.dashboard_id}:${row.metric_date}`)));
    metricsMap.set(row.dashboard_id, values);
  }
  const channelsMap = new Map<string, AdPerformanceOrganicChannel[]>();
  for (const channel of advertising.channels) {
    const values = channelsMap.get(channel.dashboard_id) ?? [];
    values.push({ id: channel.id, name: channel.name, sortOrder: channel.sort_order });
    channelsMap.set(channel.dashboard_id, values);
  }
  const ordered = sortByNearestWebinar(dashboards.map((dashboard) => ({ ...dashboard, free_webinar_at: courseMap.get(dashboard.course_id ?? "")?.free_webinar_at })));
  return ordered.map((dashboard) => {
    const course = courseMap.get(dashboard.course_id ?? "");
    const project = externalMap.get(dashboard.id);
    const metrics = metricsMap.get(dashboard.id) ?? [];
    const saved = webinarMap.get(course?.id ?? "");
    const payments = paymentsResult.data?.get(course?.id ?? "");
    const webinar = course ? {
      ad_spend: saved?.ad_spend ?? null, group_chat_count: saved?.group_chat_count ?? null, live_peak_count: saved?.live_peak_count ?? null,
      // Never fall back to historical manual payment values if the paid roster fails.
      payment_count: payments?.payment_count ?? null, revenue: payments?.revenue ?? null,
    } : null;
    return {
      id: dashboard.id, name: course?.name ?? (project ? [project.course_name, project.cohort].filter(Boolean).join(" · ") : "강의 미설정"),
      instructorName: course?.instructor_name ?? project?.instructor_name ?? "",
      href: `/services/${project ? "external-marketing" : "ad-performance"}/${dashboard.id}`,
      startDate: dashboard.start_date, endDate: metrics.at(-1)?.metricDate ?? null,
      values: bulkValues(metrics, Number(dashboard.total_budget), channelsMap.get(dashboard.id) ?? [], webinar),
      error: course && (webinarsResult.failed || paymentsResult.failed) ? "웨비나 또는 유료수강생 실적을 불러오지 못했습니다. 해당 지표는 입력값이 없는 것으로 표시됩니다." : undefined,
    };
  });
}
