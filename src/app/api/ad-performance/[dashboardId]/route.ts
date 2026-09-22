import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { adPerformanceErrorResponse, updateDashboardSchema } from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

async function authorizedDashboard(dashboardId: string, workspaceId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_performance_dashboards")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", z.uuid().parse(dashboardId))
    .maybeSingle();
  if (error) throw new Error(`광고성과 조회 실패: ${error.code}`);
  if (!data) throw new Error("NOT_FOUND");
  return admin;
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId }, membership, input] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json().then((body) => updateDashboardSchema.parse(body)),
    ]);
    const admin = await authorizedDashboard(dashboardId, membership.workspace_id);
    const now = new Date().toISOString();
    const organicChannelIds = [...new Set(input.metrics.flatMap((metric) => Object.keys(metric.organicLeads)))];
    if (organicChannelIds.length) {
      const { data: channels, error: channelsError } = await admin
        .from("ad_performance_organic_channels")
        .select("id")
        .eq("dashboard_id", dashboardId)
        .in("id", organicChannelIds);
      if (channelsError) throw new Error(`오가닉 채널 확인 실패: ${channelsError.code}`);
      if ((channels ?? []).length !== organicChannelIds.length) throw new Error("다른 대시보드의 오가닉 채널이 포함되어 있습니다.");
    }
    const { error: dashboardError } = await admin
      .from("ad_performance_dashboards")
      .update({
        start_date: input.startDate,
        total_budget: input.totalBudget,
        updated_by: user.id,
        updated_at: now,
      })
      .eq("id", dashboardId);
    if (dashboardError) throw new Error(`광고 설정 저장 실패: ${dashboardError.code}`);

    if (input.metrics.length) {
      const { error: metricsError } = await admin.from("ad_performance_dashboard_metrics").upsert(
        input.metrics.map((metric) => ({
          dashboard_id: dashboardId,
          metric_date: metric.metricDate,
          google_impressions: metric.googleImpressions,
          meta_impressions: metric.metaImpressions,
          google_clicks: metric.googleClicks,
          meta_clicks: metric.metaClicks,
          google_ad_leads: metric.googleAdLeads,
          meta_ad_leads: metric.metaAdLeads,
          google_spend: metric.googleSpend,
          meta_spend: metric.metaSpend,
          google_landing_leads: metric.googleLandingLeads,
          meta_landing_leads: metric.metaLandingLeads,
          admin_cumulative_leads: metric.adminCumulativeLeads,
          created_by: user.id,
          updated_by: user.id,
          updated_at: now,
        })),
        { onConflict: "dashboard_id,metric_date" },
      );
      if (metricsError) throw new Error(`날짜별 광고성과 저장 실패: ${metricsError.code}`);

      const organicValues = input.metrics.flatMap((metric) => Object.entries(metric.organicLeads).map(([channelId, leadCount]) => ({
        dashboard_id: dashboardId,
        channel_id: channelId,
        metric_date: metric.metricDate,
        lead_count: leadCount,
        created_by: user.id,
        updated_by: user.id,
        updated_at: now,
      })));
      if (organicValues.length) {
        const { error: organicError } = await admin
          .from("ad_performance_organic_metric_values")
          .upsert(organicValues, { onConflict: "dashboard_id,channel_id,metric_date" });
        if (organicError) throw new Error(`오가닉 DB 저장 실패: ${organicError.code}`);
      }
    }
    return Response.json({ saved: true });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    const admin = await authorizedDashboard(dashboardId, membership.workspace_id);
    const { error } = await admin.from("ad_performance_dashboards").delete().eq("id", dashboardId);
    if (error) throw new Error(`광고성과 대시보드 삭제 실패: ${error.code}`);
    return Response.json({ deleted: true });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
