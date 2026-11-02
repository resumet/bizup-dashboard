import { redirect } from "next/navigation";

import { YoutubeCourseList } from "@/components/youtube-management/course-list";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import { countYoutubeAppearances } from "@/lib/youtube-management/course-list";
import { getYoutubeFilmingAlert } from "@/lib/youtube-management/filming-alert";
import { loadYoutubeFilmingAlertSettings } from "@/lib/youtube-management/settings-server";

export default async function YoutubeManagementPage() {
  const { admin, membership } = await requireCourseDocumentMember().catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  });
  const [{ data, error }, filmingAlertSettings] = await Promise.all([
    admin
      .from("courses")
      .select("id,name,instructor_name,cohort,status,free_webinar_at,course_youtube_appearances(request_status,filming_confirmed,filming_date,upload_date),course_youtube_settings(appearance_not_required)")
      .eq("workspace_id", membership.workspace_id)
      .order("created_at", { ascending: false }),
    loadYoutubeFilmingAlertSettings(membership.workspace_id, admin),
  ]);
  if (error) throw new Error(`강의 목록을 불러오지 못했습니다: ${error.code}`);

  return (
    <YoutubeCourseList
      filmingAlertWeeks={filmingAlertSettings.filmingAlertWeeks}
      courses={sortByNearestWebinar(data ?? []).map((course) => {
        const appearances = course.course_youtube_appearances ?? [];
        const appearanceNotRequired = course.course_youtube_settings?.[0]?.appearance_not_required ?? false;
        const filmingAlert = getYoutubeFilmingAlert(course.free_webinar_at, appearances, undefined, filmingAlertSettings.filmingAlertWeeks);
        return {
          ...course,
          appearanceNotRequired,
          ...countYoutubeAppearances(appearances),
          filmingAlert: appearanceNotRequired ? { ...filmingAlert, alertCount: 0 } : filmingAlert,
        };
      })}
    />
  );
}
