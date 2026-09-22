import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "날짜 형식이 올바르지 않습니다.");
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const metricSchema = z.object({
  metricDate: dateValue,
  googleImpressions: count,
  metaImpressions: count,
  googleClicks: count,
  metaClicks: count,
  googleAdLeads: count,
  metaAdLeads: count,
  googleSpend: count,
  metaSpend: count,
  landingLeads: count,
  googleAdminLeads: count,
  metaAdminLeads: count,
});
const dashboardSchema = z.object({
  startDate: dateValue,
  totalBudget: count,
  metrics: z.array(metricSchema).max(1_000),
}).superRefine((value, context) => {
  const dates = new Set<string>();
  value.metrics.forEach((metric, index) => {
    if (dates.has(metric.metricDate)) {
      context.addIssue({ code: "custom", path: ["metrics", index, "metricDate"], message: "같은 날짜를 두 번 입력할 수 없습니다." });
    }
    dates.add(metric.metricDate);
    if (metric.metricDate < value.startDate) {
      context.addIssue({ code: "custom", path: ["metrics", index, "metricDate"], message: "광고 시작일 이전 데이터는 저장할 수 없습니다." });
    }
  });
});

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "광고성과를 저장하지 못했습니다.";
  return Response.json({ message: message === "UNAUTHORIZED" ? "로그인이 필요합니다." : message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [membership, input] = await Promise.all([
      requireCourseOperationsMembership(user.id),
      request.json().then((body) => dashboardSchema.parse(body)),
    ]);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error: settingsError } = await admin.from("ad_performance_settings").upsert({
      workspace_id: membership.workspace_id,
      start_date: input.startDate,
      total_budget: input.totalBudget,
      created_by: user.id,
      updated_by: user.id,
      updated_at: now,
    }, { onConflict: "workspace_id" });
    if (settingsError) throw new Error(`광고 설정 저장 실패: ${settingsError.code}`);

    if (input.metrics.length) {
      const { error: metricsError } = await admin.from("ad_performance_daily_metrics").upsert(
        input.metrics.map((metric) => ({
          workspace_id: membership.workspace_id,
          metric_date: metric.metricDate,
          google_impressions: metric.googleImpressions,
          meta_impressions: metric.metaImpressions,
          google_clicks: metric.googleClicks,
          meta_clicks: metric.metaClicks,
          google_ad_leads: metric.googleAdLeads,
          meta_ad_leads: metric.metaAdLeads,
          google_spend: metric.googleSpend,
          meta_spend: metric.metaSpend,
          landing_leads: metric.landingLeads,
          google_admin_leads: metric.googleAdminLeads,
          meta_admin_leads: metric.metaAdminLeads,
          created_by: user.id,
          updated_by: user.id,
          updated_at: now,
        })),
        { onConflict: "workspace_id,metric_date" },
      );
      if (metricsError) throw new Error(`날짜별 광고성과 저장 실패: ${metricsError.code}`);
    }
    return Response.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [membership, body] = await Promise.all([
      requireCourseOperationsMembership(user.id),
      request.json(),
    ]);
    const { metricDate } = z.object({ metricDate: dateValue }).parse(body);
    const { error } = await createAdminClient()
      .from("ad_performance_daily_metrics")
      .delete()
      .eq("workspace_id", membership.workspace_id)
      .eq("metric_date", metricDate);
    if (error) throw new Error(`날짜별 광고성과 삭제 실패: ${error.code}`);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
