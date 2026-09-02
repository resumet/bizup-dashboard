import { calculateDiscountRate } from "./pricing";
import { WEBINAR_TIME_OPTIONS } from "./schedule";

export type CourseShareSection =
  | "schedule"
  | "links"
  | "events"
  | "options"
  | "youtube";

export const COURSE_SHARE_SECTION_OPTIONS: Array<{
  value: CourseShareSection;
  label: string;
}> = [
  { value: "schedule", label: "기본 정보와 일정" },
  { value: "links", label: "카톡방·웨비나·기타 링크" },
  { value: "events", label: "판매 이벤트" },
  { value: "options", label: "강의 옵션과 가격" },
  { value: "youtube", label: "유튜브 출연" },
];

export type CourseShareData = {
  name: string;
  instructorName: string;
  freeWebinarDate: string;
  freeWebinarTime: string;
  startsDate: string;
  earlyBirdEvent: string;
  first50Event: string;
  landingPageLink: string;
  freeKakaoRoom1Link: string;
  freeKakaoRoom2Link: string;
  communicationRoomLink: string;
  paymentLink: string;
  inquiryLink: string;
  curriculumLink: string;
  freeGiftLink: string;
  courseViewingLink: string;
  options: Array<{ name: string; listPrice: string; salePrice: string }>;
  youtubeAppearances: Array<{
    channelName: string;
    channelUrl: string;
    videoUrl: string;
  }>;
};

export function truncateKakaoShareText(value: string) {
  const characters = Array.from(value);
  return characters.length <= 200
    ? value
    : `${characters.slice(0, 199).join("")}…`;
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value || "미정";
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatTime(value: string) {
  return (
    WEBINAR_TIME_OPTIONS.find((option) => option.value === value)?.label ||
    value ||
    "미정"
  );
}

function formatPrice(value: string) {
  const amount = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(amount) ? `${amount.toLocaleString("ko-KR")}원` : "미정";
}

function present(value: string, fallback = "미정") {
  return value.trim() || fallback;
}

function linkSection(data: CourseShareData) {
  const links = [
    ["기본 랜딩페이지", data.landingPageLink],
    ["무료카톡방 1번", data.freeKakaoRoom1Link],
    ["무료카톡방 2번", data.freeKakaoRoom2Link],
    ["소통방", data.communicationRoomLink],
    ["결제링크", data.paymentLink],
    ["문의하기 링크", data.inquiryLink],
    ["커리큘럼 보기 링크", data.curriculumLink],
    ["무료강의 수강 선물받기 링크", data.freeGiftLink],
    ["강의 시청하기 링크", data.courseViewingLink],
  ].filter((entry) => entry[1].trim());
  return [
    "[링크 안내]",
    ...(links.length
      ? links.map(([label, value]) => `• ${label}\n${value}`)
      : ["등록된 링크가 없습니다."]),
  ].join("\n");
}

export function buildCourseShareSummary(
  data: CourseShareData,
  selectedSections: CourseShareSection[],
) {
  const selected = new Set(selectedSections);
  const sections: string[] = [`📚 ${present(data.name, "강의 안내")}`];

  if (selected.has("schedule")) {
    sections.push(
      [
        "[기본 정보와 일정]",
        `• 강사: ${present(data.instructorName)}`,
        `• 무료 웨비나: ${formatDate(data.freeWebinarDate)} ${formatTime(data.freeWebinarTime)}`,
        `• 개강일: ${formatDate(data.startsDate)}`,
      ].join("\n"),
    );
  }
  if (selected.has("links")) sections.push(linkSection(data));
  if (selected.has("events")) {
    sections.push(
      [
        "[판매 이벤트]",
        `• 얼리버드: ${present(data.earlyBirdEvent)}`,
        `• 선착순 50명: ${present(data.first50Event)}`,
      ].join("\n"),
    );
  }
  if (selected.has("options")) {
    const options = data.options.filter((option) => option.name.trim());
    sections.push(
      [
        "[강의 옵션과 가격]",
        ...(options.length
          ? options.map((option) => {
              const rate = calculateDiscountRate(
                option.listPrice,
                option.salePrice,
              );
              const discount = rate === null ? "" : ` · ${rate}% 할인`;
              return `• ${option.name}: 정가 ${formatPrice(option.listPrice)} / 할인가 ${formatPrice(option.salePrice)}${discount}`;
            })
          : ["등록된 옵션이 없습니다."]),
      ].join("\n"),
    );
  }
  if (selected.has("youtube")) {
    const appearances = data.youtubeAppearances.filter((item) =>
      [item.channelName, item.channelUrl, item.videoUrl].some((value) =>
        value.trim(),
      ),
    );
    sections.push(
      [
        "[유튜브 출연]",
        ...(appearances.length
          ? appearances.map((item) =>
              [
                `• ${present(item.channelName, "채널명 미정")}`,
                item.channelUrl.trim() ? `  채널: ${item.channelUrl}` : "",
                item.videoUrl.trim() ? `  영상: ${item.videoUrl}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
          : ["등록된 유튜브 출연 정보가 없습니다."]),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}
