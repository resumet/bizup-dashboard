import { z } from "zod";

import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import {
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { externalMarketingSettingsSchema } from "@/lib/external-marketing/model";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ dashboardId: string }> };

async function contextFor(dashboardId: string) {
  const user = await requireCourseOperationsUser(await createClient());
  const membership = await requireCourseOperationsMembership(user.id);
  const id = z.uuid().parse(dashboardId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_marketing_projects")
    .select("dashboard_id")
    .eq("workspace_id", membership.workspace_id)
    .eq("dashboard_id", id)
    .maybeSingle();
  if (error) throw new Error(`외부마케팅대행 조회 실패: ${error.code}`);
  if (!data) throw new Error("NOT_FOUND");
  return { user, admin, id };
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const [{ dashboardId }, input] = await Promise.all([
      params,
      request.json().then((body) => externalMarketingSettingsSchema.parse(body)),
    ]);
    const { user, admin, id } = await contextFor(dashboardId);
    const now = new Date().toISOString();
    const { error: dashboardError } = await admin
      .from("ad_performance_dashboards")
      .update({
        course_id: null,
        start_date: input.startDate,
        total_budget: input.totalBudget,
        updated_by: user.id,
        updated_at: now,
      })
      .eq("id", id);
    if (dashboardError) throw new Error(`광고 설정 저장 실패: ${dashboardError.code}`);
    const { error: projectError } = await admin
      .from("external_marketing_projects")
      .update({
        course_name: input.courseName,
        instructor_name: input.instructorName,
        affiliate_name: input.affiliateName,
        project_manager: input.projectManager,
        cohort: input.cohort,
        webinar_date: input.webinarDate || null,
        landing_pages: input.landingPages,
        creative_drive_url: input.creativeDriveUrl,
        intake_enabled: false,
        public_enabled: input.publicEnabled,
        updated_by: user.id,
        updated_at: now,
      })
      .eq("dashboard_id", id);
    if (projectError) throw new Error(`외부마케팅대행 설정 저장 실패: ${projectError.code}`);
    return Response.json({ saved: true });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const [{ dashboardId }, input] = await Promise.all([
      params,
      request.json().then((body) => z.object({ kind: z.literal("public"), enabled: z.boolean() }).strict().parse(body)),
    ]);
    const { user, admin, id } = await contextFor(dashboardId);
    const { data, error } = await admin.from("external_marketing_projects")
      .update({ public_enabled: input.enabled, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("dashboard_id", id)
      .select("public_enabled")
      .single();
    if (error) throw new Error(`공개 설정 저장 실패: ${error.code}`);
    return Response.json({ publicEnabled: data.public_enabled });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { dashboardId } = await params;
    const { admin, id } = await contextFor(dashboardId);
    const { error } = await admin.from("ad_performance_dashboards").delete().eq("id", id);
    if (error) throw new Error(`외부마케팅대행 삭제 실패: ${error.code}`);
    return Response.json({ deleted: true });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
