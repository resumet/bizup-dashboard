import { ZodError } from "zod";

import { externalMarketingInfoSchema } from "@/lib/external-marketing/model";
import { loadExternalMarketingIntake } from "@/lib/external-marketing/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json({ message: error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  console.error("외부마케팅대행 입력 저장 실패", error);
  return Response.json({ message: "정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const [{ token }, input] = await Promise.all([
      params,
      request.json().then((body) => externalMarketingInfoSchema.parse(body)),
    ]);
    const project = await loadExternalMarketingIntake(token);
    if (!project) return Response.json({ message: "입력 링크가 만료되었거나 비활성화되었습니다." }, { status: 404 });
    const { data, error } = await createAdminClient()
      .from("external_marketing_projects")
      .update({
        course_name: input.courseName,
        instructor_name: input.instructorName,
        cohort: input.cohort,
        landing_pages: input.landingPages,
        creative_drive_url: input.creativeDriveUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("dashboard_id", project.dashboardId)
      .eq("intake_token", token)
      .eq("intake_enabled", true)
      .select("dashboard_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ message: "입력 링크가 만료되었거나 비활성화되었습니다." }, { status: 404 });
    return Response.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
