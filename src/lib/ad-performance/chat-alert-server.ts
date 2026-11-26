import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatAudienceAlert } from "./chat-alert";

export async function loadCourseChatAudience(workspaceId: string, courseId?: string) {
  const admin = createAdminClient();
  const dashboards: { id: string; course_id: string | null; ad_leads: number }[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = admin.from("ad_performance_dashboard_summaries").select("id,course_id,ad_leads").eq("workspace_id", workspaceId).eq("service_scope", "bizup").order("id").range(offset, offset + 499);
    if (courseId) query = query.eq("course_id", courseId);
    const { data, error } = await query;
    if (error) throw new Error("톡방 유입 현황을 불러오지 못했습니다.");
    dashboards.push(...data);
    if (data.length < 500) break;
  }
  const audience: Record<string, { members: number; metricDate: string; alert: string | null }> = {};
  const latest = new Map<string, { members: number; metricDate: string }>();
  const ids = dashboards.map(row => row.id);
  for (let batch = 0; batch < ids.length; batch += 100) {
    for (let offset = 0; ; offset += 500) {
      const result = await admin.from("ad_performance_dashboard_metrics").select("dashboard_id,chat_room_members,metric_date").in("dashboard_id", ids.slice(batch, batch + 100)).not("chat_room_members", "is", null).order("metric_date").order("dashboard_id").range(offset, offset + 499);
      if (result.error) throw new Error("톡방 유입 현황을 불러오지 못했습니다.");
      for (const row of result.data) latest.set(row.dashboard_id, { members: Number(row.chat_room_members), metricDate: row.metric_date });
      if (result.data.length < 500) break;
    }
  }
  for (const row of dashboards) {
    const metric = latest.get(row.id);
    if (!row.course_id || !metric) continue;
    const previous = audience[row.course_id];
    if (!previous || metric.metricDate >= previous.metricDate) {
      audience[row.course_id] = { ...metric, alert: chatAudienceAlert(Number(row.ad_leads), metric.members) };
    }
  }
  return audience;
}
