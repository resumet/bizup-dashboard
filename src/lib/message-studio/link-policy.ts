import type { MessageStudioDraft } from "@/lib/message-studio/types";

const URL_PATTERN = /https?:\/\/[^\s]+/giu;

export const MESSAGE_30_LINK_LABELS = [
  "✅ 수강 신청 링크 ✅",
  "👉 결제 및 수강 문의하기",
  "💘 커리큘럼 보기",
  "💌 무료강의 수강 선물 받기",
] as const;

function stripUrls(message: string) {
  return message
    .replace(URL_PATTERN, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function stripMessage30LinkBlock(message: string) {
  const firstLabelPosition = MESSAGE_30_LINK_LABELS.reduce(
    (earliest, label) => {
      const position = message.indexOf(label);
      return position >= 0 && (earliest < 0 || position < earliest)
        ? position
        : earliest;
    },
    -1,
  );
  return stripUrls(
    firstLabelPosition >= 0 ? message.slice(0, firstLabelPosition) : message,
  );
}

export function buildMessage30LinkBlock(project: MessageStudioDraft) {
  return [
    MESSAGE_30_LINK_LABELS[0],
    project.payment_link.trim(),
    "",
    MESSAGE_30_LINK_LABELS[1],
    project.inquiry_link.trim(),
    "",
    MESSAGE_30_LINK_LABELS[2],
    project.curriculum_link.trim(),
    "",
    MESSAGE_30_LINK_LABELS[3],
    project.replay_link.trim(),
  ].join("\n");
}

export function enforceMessageLinkPolicy(
  position: number,
  message: string,
  project: MessageStudioDraft,
) {
  if (position === 30) {
    return [stripMessage30LinkBlock(message), buildMessage30LinkBlock(project)]
      .filter(Boolean)
      .join("\n\n");
  }

  return [stripUrls(message), project.payment_link.trim()]
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeGeneratedMessage(
  position: number,
  message: string,
  project: MessageStudioDraft,
) {
  return message.trim()
    ? enforceMessageLinkPolicy(position, message, project)
    : "";
}

export function validateMessageLinks(
  positions: number[],
  project: MessageStudioDraft,
) {
  const errors: string[] = [];
  if (positions.some((position) => position >= 1 && position <= 30)) {
    if (!project.payment_link.trim()) errors.push("결제 링크를 입력해 주세요.");
  }
  if (positions.includes(30)) {
    if (!project.inquiry_link.trim()) errors.push("문의 링크를 입력해 주세요.");
    if (!project.curriculum_link.trim())
      errors.push("커리큘럼 링크를 입력해 주세요.");
    if (!project.replay_link.trim())
      errors.push("다시보기 링크를 입력해 주세요.");
  }
  return errors;
}
