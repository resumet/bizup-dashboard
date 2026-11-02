import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  youtubeFilmingAlertSettingsSchema,
  type YoutubeFilmingAlertSettings,
} from "./settings";

export async function loadYoutubeFilmingAlertSettings(
  workspaceId: string,
  admin = createAdminClient(),
): Promise<YoutubeFilmingAlertSettings> {
  const { data, error } = await admin
    .from("workspaces")
    .select("youtube_filming_alert_weeks")
    .eq("id", workspaceId)
    .single();

  if (error) throw new Error(`유튜브 촬영 일정 알림 설정 조회 실패: ${error.code ?? "UNKNOWN"}`);

  const parsed = youtubeFilmingAlertSettingsSchema.safeParse({
    filmingAlertWeeks: data.youtube_filming_alert_weeks,
  });
  if (!parsed.success) throw new Error("저장된 유튜브 촬영 일정 알림 설정이 올바르지 않습니다.");
  return parsed.data;
}

export async function saveYoutubeFilmingAlertSettings(
  workspaceId: string,
  settings: YoutubeFilmingAlertSettings,
  admin = createAdminClient(),
): Promise<YoutubeFilmingAlertSettings> {
  const validated = youtubeFilmingAlertSettingsSchema.parse(settings);
  const { data, error } = await admin
    .from("workspaces")
    .update({ youtube_filming_alert_weeks: validated.filmingAlertWeeks })
    .eq("id", workspaceId)
    .select("youtube_filming_alert_weeks")
    .single();

  if (error) throw new Error(`유튜브 촬영 일정 알림 설정 저장 실패: ${error.code ?? "UNKNOWN"}`);

  return youtubeFilmingAlertSettingsSchema.parse({
    filmingAlertWeeks: data.youtube_filming_alert_weeks,
  });
}
