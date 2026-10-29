import type { CourseCostCalculationDetails } from "./types";
import { parseYoutubeAppearanceFeeCostDetails } from "./youtube-appearance-fee";
import { parseYoutubeRsCostDetails } from "./youtube-rs";

export function parseCourseCostCalculationDetails(value: unknown): CourseCostCalculationDetails | null {
  if (value === null || value === undefined) return null;
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  if (input.kind === "YOUTUBE_RS") return parseYoutubeRsCostDetails(value);
  if (input.kind === "YOUTUBE_APPEARANCE_FEE") return parseYoutubeAppearanceFeeCostDetails(value);
  throw new Error("비용 상세 계산 내역이 올바르지 않습니다.");
}
