import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { externalMarketingPublicInfoSchema, externalMarketingTokenSchema } from "./model";

export async function savePublicExternalMarketingInfo(token: string, input: unknown, clientFactory = createAdminClient) {
  if (!externalMarketingTokenSchema.safeParse(token).success) return null;
  const info = externalMarketingPublicInfoSchema.parse(input);
  const { data, error } = await clientFactory().from("external_marketing_projects")
    .update({ course_name: info.courseName, instructor_name: info.instructorName, cohort: info.cohort,
      webinar_date: info.webinarDate || null, creative_drive_url: info.creativeDriveUrl, landing_pages: info.landingPages, updated_at: new Date().toISOString() })
    .eq("public_token", token).eq("public_enabled", true)
    .select("course_name,instructor_name,cohort,webinar_date,creative_drive_url,landing_pages").maybeSingle();
  if (error) throw new Error(`공개 강의 정보 저장 실패: ${error.code}`);
  return data ? externalMarketingPublicInfoSchema.parse({ courseName: data.course_name, instructorName: data.instructor_name,
    cohort: data.cohort, webinarDate: data.webinar_date ?? "", creativeDriveUrl: data.creative_drive_url, landingPages: data.landing_pages }) : null;
}
