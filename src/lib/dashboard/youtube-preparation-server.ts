import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadYoutubeFilmingAlertSettings } from "@/lib/youtube-management/settings-server";
import {
  buildYoutubePreparationSummary,
  type YoutubePreparationAppearance,
  type YoutubePreparationSummary,
} from "./youtube-preparation";

type YoutubePreparationCourseRow = {
  id: string;
  free_webinar_at: string | null;
  course_youtube_appearances: YoutubePreparationAppearance[] | null;
  course_youtube_settings: { appearance_not_required: boolean } | { appearance_not_required: boolean }[] | null;
};

function appearanceNotRequired(settings: YoutubePreparationCourseRow["course_youtube_settings"]) {
  const setting = Array.isArray(settings) ? settings[0] : settings;
  return setting?.appearance_not_required === true;
}

export async function loadDashboardYoutubePreparation(workspaceId: string, today: string) {
  const admin = createAdminClient();
  const [coursesResult, settings] = await Promise.all([
    admin
      .from("courses")
      .select("id,free_webinar_at,course_youtube_appearances(request_status,filming_confirmed,filming_date,upload_date),course_youtube_settings(appearance_not_required)")
      .eq("workspace_id", workspaceId),
    loadYoutubeFilmingAlertSettings(workspaceId, admin),
  ]);

  if (coursesResult.error) {
    throw new Error(`유튜브 강의 준비 현황 조회 실패: ${coursesResult.error.code}`);
  }

  return new Map<string, YoutubePreparationSummary>(
    ((coursesResult.data ?? []) as YoutubePreparationCourseRow[]).map((course) => [
      course.id,
      buildYoutubePreparationSummary(
        course.free_webinar_at,
        course.course_youtube_appearances ?? [],
        today,
        settings.filmingAlertWeeks,
        appearanceNotRequired(course.course_youtube_settings),
      ),
    ]),
  );
}
