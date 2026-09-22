import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { adPerformanceErrorResponse, organicChannelNameSchema } from "@/lib/ad-performance/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const [{ dashboardId }, membership, body] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json(),
    ]);
    z.uuid().parse(dashboardId);
    const name = organicChannelNameSchema.parse(body?.name);
    const admin = createAdminClient();
    const [{ data: dashboard, error: dashboardError }, { data: channels, error: channelsError }] = await Promise.all([
      admin.from("ad_performance_dashboards").select("id").eq("workspace_id", membership.workspace_id).eq("id", dashboardId).maybeSingle(),
      admin.from("ad_performance_organic_channels").select("id,name,sort_order").eq("dashboard_id", dashboardId).order("sort_order", { ascending: false }),
    ]);
    if (dashboardError) throw new Error(`광고성과 조회 실패: ${dashboardError.code}`);
    if (!dashboard) throw new Error("NOT_FOUND");
    if (channelsError) throw new Error(`오가닉 채널 조회 실패: ${channelsError.code}`);
    if ((channels ?? []).some((channel) => channel.name.trim().toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"))) {
      throw new Error("같은 이름의 오가닉 채널이 이미 있습니다.");
    }
    const sortOrder = Math.min(32_767, Number(channels?.[0]?.sort_order ?? -1) + 1);
    const { data, error } = await admin
      .from("ad_performance_organic_channels")
      .insert({ dashboard_id: dashboardId, name, sort_order: sortOrder, created_by: user.id })
      .select("id,name,sort_order")
      .single();
    if (error?.code === "23505") throw new Error("같은 이름의 오가닉 채널이 이미 있습니다.");
    if (error) throw new Error(`오가닉 채널 추가 실패: ${error.code}`);
    return Response.json({ id: data.id, name: data.name, sortOrder: data.sort_order }, { status: 201 });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
