import { getYoutubeFilmingAlert } from "@/lib/youtube-management/filming-alert";
import type { YoutubeFilmingAlertWeeks } from "@/lib/youtube-management/settings";

export type YoutubePreparationAppearance = {
  request_status: string;
  filming_confirmed: boolean | null;
  filming_date: string | null;
  upload_date: string | null;
};

export type YoutubePreparationSummary = {
  appearanceNotRequired: boolean;
  appearanceCount: number;
  confirmedAppearanceCount: number;
  filmingConfirmedCount: number;
  uploadCompletedCount: number;
  filmingAlertCount: number;
  filmingAlertWeeks: YoutubeFilmingAlertWeeks;
};

export function buildYoutubePreparationSummary(
  freeWebinarAt: string | null,
  appearances: readonly YoutubePreparationAppearance[],
  today: string,
  filmingAlertWeeks: YoutubeFilmingAlertWeeks,
  appearanceNotRequired = false,
): YoutubePreparationSummary {
  const filmingAlert = getYoutubeFilmingAlert(
    freeWebinarAt,
    appearances,
    today,
    filmingAlertWeeks,
  );

  return {
    appearanceNotRequired,
    appearanceCount: appearances.length,
    confirmedAppearanceCount: appearances.filter(
      (appearance) => appearance.request_status === "confirmed",
    ).length,
    filmingConfirmedCount: appearances.filter(
      (appearance) => appearance.filming_confirmed === true && Boolean(appearance.filming_date),
    ).length,
    uploadCompletedCount: appearances.filter((appearance) => Boolean(appearance.upload_date)).length,
    filmingAlertCount: appearanceNotRequired ? 0 : filmingAlert.alertCount,
    filmingAlertWeeks,
  };
}
