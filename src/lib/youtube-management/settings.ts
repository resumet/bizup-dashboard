import { z } from "zod";

export const YOUTUBE_FILMING_ALERT_WEEK_OPTIONS = [3, 4, 5, 6] as const;
export type YoutubeFilmingAlertWeeks = (typeof YOUTUBE_FILMING_ALERT_WEEK_OPTIONS)[number];

export const DEFAULT_YOUTUBE_FILMING_ALERT_WEEKS: YoutubeFilmingAlertWeeks = 4;

const youtubeFilmingAlertWeeksSchema = z.number().int().refine(
  (value): value is YoutubeFilmingAlertWeeks =>
    YOUTUBE_FILMING_ALERT_WEEK_OPTIONS.some((option) => option === value),
  "알림 기준은 3주, 4주, 5주, 6주 중에서 선택해 주세요.",
);

export const youtubeFilmingAlertSettingsSchema = z.object({
  filmingAlertWeeks: youtubeFilmingAlertWeeksSchema,
});

export type YoutubeFilmingAlertSettings = z.infer<typeof youtubeFilmingAlertSettingsSchema>;
