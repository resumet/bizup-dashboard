import type { CourseOperationsInput } from "./types";
import {
  isAllowedWebinarTime,
  isKoreaDateOnly,
} from "./schedule";
import { decodeReadableUrl } from "./youtube-channels";
import { normalizeRequiredTasks } from "./required-tasks";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function text(value: unknown, label: string, maxLength: number, required = true) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new Error(`${label}을(를) 입력해 주세요.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label}은(는) ${maxLength.toLocaleString()}자 이하여야 합니다.`);
  }
  return normalized;
}

function timestamp(value: unknown, label: string) {
  const normalized = text(value, label, 50);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} 형식을 확인해 주세요.`);
  return parsed.toISOString();
}

function url(
  value: unknown,
  label: string,
  required: boolean,
  decodeForStorage = false,
) {
  const normalized = text(value, label, 2_000, required);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    const serialized = parsed.toString();
    return decodeForStorage ? decodeReadableUrl(serialized) : serialized;
  } catch {
    throw new Error(`${label}은(는) http 또는 https 주소여야 합니다.`);
  }
}

function ids(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
    .map((item) => item.trim())
    .filter((item) => UUID_PATTERN.test(item));
}

function optionalId(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} 형식을 확인해 주세요.`);
  return normalized;
}

export function parseCourseOperationsInput(value: unknown): CourseOperationsInput {
  const input =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  if (rawOptions.length > 50) throw new Error("강의 옵션은 최대 50개입니다.");

  const options = rawOptions.map((item, index) => {
    const option =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)
        : {};
    const listPrice = Number(option.listPrice);
    const salePrice = Number(option.salePrice);
    if (!Number.isSafeInteger(listPrice) || listPrice < 0) {
      throw new Error(`${index + 1}번 옵션의 정가를 0 이상의 원 단위로 입력해 주세요.`);
    }
    if (!Number.isSafeInteger(salePrice) || salePrice < 0) {
      throw new Error(`${index + 1}번 옵션의 할인가를 0 이상의 원 단위로 입력해 주세요.`);
    }
    if (salePrice > listPrice) {
      throw new Error(`${index + 1}번 옵션의 할인가가 정가보다 높습니다.`);
    }
    const groupChatLink = url(
      option.groupChatLink,
      `${index + 1}번 옵션 단톡방 주소`,
      false,
    );
    if (groupChatLink && !groupChatLink.startsWith("https://")) {
      throw new Error(`${index + 1}번 옵션 단톡방 주소는 https 주소여야 합니다.`);
    }
    const entryCode = text(
      option.entryCode,
      `${index + 1}번 옵션 입장코드`,
      6,
      false,
    );
    if (entryCode && entryCode.length < 4) {
      throw new Error(`${index + 1}번 옵션 입장코드는 4~6글자여야 합니다.`);
    }
    return {
      name: text(option.name, `${index + 1}번 옵션명`, 120),
      listPrice,
      salePrice,
      groupChatLink,
      entryCode,
    };
  });

  const appearances = Array.isArray(input.youtubeAppearances)
    ? input.youtubeAppearances
    : [];
  if (appearances.length > 50) throw new Error("유튜브 출연 정보는 최대 50개입니다.");
  const liveVideos = Array.isArray(input.liveVideos) ? input.liveVideos : [];
  if (liveVideos.length > 50) {
    throw new Error("기존 라이브 영상 링크는 최대 50개입니다.");
  }
  const customLinks = Array.isArray(input.customLinks) ? input.customLinks : [];
  if (customLinks.length > 30) {
    throw new Error("커스텀 링크는 최대 30개입니다.");
  }
  const rosterJobIds = ids(input.rosterJobIds);
  if (rosterJobIds.length > 1) {
    throw new Error("수강생 명단은 하나만 연결할 수 있습니다.");
  }

  const freeWebinarAt = timestamp(input.freeWebinarAt, "무료 웨비나 일시");
  if (!isAllowedWebinarTime(freeWebinarAt)) {
    throw new Error("무료 웨비나 시간을 선택해 주세요.");
  }
  const startsAt = timestamp(input.startsAt, "개강일");
  if (!isKoreaDateOnly(startsAt)) {
    throw new Error("개강일은 날짜만 입력해 주세요.");
  }

  return {
    name: text(input.name, "강의명", 200),
    instructorName: text(input.instructorName, "강사명", 120),
    freeWebinarAt,
    startsAt,
    earlyBirdEvent: text(input.earlyBirdEvent, "얼리버드 이벤트", 2_000, false),
    first50Event: text(input.first50Event, "선착순 50명 이벤트", 2_000, false),
    landingPageLink: url(input.landingPageLink, "기본 랜딩페이지 링크", false),
    freeKakaoRoom1Link: url(input.freeKakaoRoom1Link, "무료카톡방 1번 링크", false),
    freeKakaoRoom2Link: url(input.freeKakaoRoom2Link, "무료카톡방 2번 링크", false),
    communicationRoomLink: url(input.communicationRoomLink, "소통방 링크", false),
    paymentLink: url(input.paymentLink, "결제링크", false),
    inquiryLink: url(input.inquiryLink, "문의하기 링크", false),
    curriculumLink: url(input.curriculumLink, "커리큘럼 보기 링크", false),
    freeGiftLink: url(
      input.freeGiftLink,
      "무료강의 수강 선물받기 링크",
      false,
    ),
    courseViewingLink: url(input.courseViewingLink, "강의 시청하기 링크", false),
    courseMaterialsLink: url(input.courseMaterialsLink, "강의자료 링크", false),
    customLinks: customLinks.map((item, index) => {
      const customLink =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      return {
        name: text(customLink.name, `${index + 1}번 커스텀 링크 이름`, 100),
        url: url(customLink.url, `${index + 1}번 커스텀 링크 주소`, true),
      };
    }),
    options,
    youtubeAppearances: appearances.map((item, index) => {
      const appearance =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      return {
        channelName: text(appearance.channelName, `${index + 1}번 유튜브 채널명`, 200),
        channelUrl: url(
          appearance.channelUrl,
          `${index + 1}번 유튜브 채널 주소`,
          true,
          true,
        ),
        videoUrl: url(appearance.videoUrl, `${index + 1}번 영상 주소`, false),
      };
    }),
    liveVideos: liveVideos.map((item, index) => {
      const liveVideo =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      return {
        name: text(liveVideo.name, `${index + 1}번 라이브 영상 이름`, 200),
        videoUrl: url(
          liveVideo.videoUrl,
          `${index + 1}번 라이브 영상 주소`,
          true,
        ),
        note: text(
          liveVideo.note,
          `${index + 1}번 라이브 영상 비고`,
          500,
          false,
        ),
      };
    }),
    rosterJobIds,
    messageProjectIds: ids(input.messageProjectIds),
    freeAddressBookId: optionalId(
      input.freeAddressBookId,
      "무료강의 수강생 주소록",
    ),
    requiredTasks: normalizeRequiredTasks(input.requiredTasks),
  };
}
