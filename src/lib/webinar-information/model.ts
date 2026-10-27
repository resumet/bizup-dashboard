export const DEFAULT_WEBINAR_COMMAND_DECK_URL =
  "http://docs.google.com/presentation/d/1glOkbnWTgXufnnUNpcoDIvityzc8EHTyQghgzqpFIKM/edit";

export type WebinarInformation = {
  courseMaterialsLink: string;
  openingVideoUrl: string;
  youtubeTitle: string;
  youtubeDescription: string;
  commandDeckUrl: string;
  bannerStorageUrl: string;
  youtubeLiveUrl: string;
};

type WebinarShareContext = {
  courseName: string;
  instructorName: string;
  cohort: string;
  openingVideoName?: string;
};

function text(value: unknown, label: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) {
    throw new Error(`${label}은(는) ${maxLength.toLocaleString("ko-KR")}자 이하여야 합니다.`);
  }
  return normalized;
}

function url(value: unknown, label: string) {
  const normalized = text(value, label, 2_048);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${label}은(는) http 또는 https 주소여야 합니다.`);
  }
}

export function parseWebinarInformation(value: unknown): WebinarInformation {
  const input = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};

  return {
    courseMaterialsLink: url(input.courseMaterialsLink, "교안 링크"),
    openingVideoUrl: url(input.openingVideoUrl, "초반 영상 링크"),
    youtubeTitle: text(input.youtubeTitle, "유튜브 제목", 200),
    youtubeDescription: text(input.youtubeDescription, "유튜브 설명", 5_000),
    commandDeckUrl: url(input.commandDeckUrl, "지령창 링크"),
    bannerStorageUrl: url(input.bannerStorageUrl, "배너 저장소 링크"),
    youtubeLiveUrl: url(input.youtubeLiveUrl, "유튜브 라이브 링크"),
  };
}

function display(value: string) {
  return value.trim() || "미입력";
}

export function buildWebinarInformationShareText(
  information: WebinarInformation,
  context: WebinarShareContext,
) {
  const cohort = context.cohort.trim();
  const courseLabel = [
    context.instructorName.trim(),
    context.courseName.trim(),
    cohort ? (cohort.endsWith("기") ? cohort : `${cohort}기`) : "",
  ].filter(Boolean).join(" | ");
  const openingVideo = context.openingVideoName?.trim()
    ? `${context.openingVideoName.trim()} | ${display(information.openingVideoUrl)}`
    : display(information.openingVideoUrl);

  return [
    "[웨비나 정보]",
    `강의: ${display(courseLabel)}`,
    `교안: ${display(information.courseMaterialsLink)}`,
    `초반 영상: ${openingVideo}`,
    `유튜브 제목: ${display(information.youtubeTitle)}`,
    `유튜브 설명: ${display(information.youtubeDescription)}`,
    `지령창: ${display(information.commandDeckUrl)}`,
    `배너 저장소: ${display(information.bannerStorageUrl)}`,
    `유튜브 라이브: ${display(information.youtubeLiveUrl)}`,
  ].join("\n");
}
