import { validTaskLink } from "./task-links";

export const WBS_COURSE_LINK_FIELDS = [
  { key: "landing_page_link", label: "기본 랜딩페이지" },
  { key: "free_kakao_room_1_link", label: "무료카톡방 1번" },
  { key: "free_kakao_room_2_link", label: "무료카톡방 2번" },
  { key: "paid_kakao_room_link", label: "유료수강생단톡방" },
  { key: "communication_room_link", label: "소통방" },
  { key: "payment_link", label: "결제링크" },
  { key: "inquiry_link", label: "문의하기 링크" },
  { key: "curriculum_link", label: "커리큘럼 보기 링크" },
  { key: "free_gift_link", label: "무료강의 수강 선물받기 링크" },
  { key: "course_viewing_link", label: "강의 시청하기 링크" },
  { key: "course_materials_link", label: "강의자료 링크" },
] as const;

export type WbsCourseLinkOption = { label: string; url: string };
export const WBS_COURSE_LINK_COLUMNS = [...WBS_COURSE_LINK_FIELDS.map(({ key }) => key), "custom_links"].join(",");

export function courseLinkPath(key: string) {
  return `/services/course-wbs/{courseId}/link?key=${encodeURIComponent(key)}`;
}

export function courseLinkLabel(key: string): string | null {
  return WBS_COURSE_LINK_FIELDS.find((field) => field.key === key)?.label
    ?? (key.startsWith("custom:") && key.slice(7).trim() ? key.slice(7) : null);
}

function customLinks(value: unknown): { name: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter((link): link is { name: string; url: string } => link !== null && typeof link === "object" && typeof link.name === "string" && typeof link.url === "string");
}

export function savedCourseLinkOptions(values: unknown[]): WbsCourseLinkOption[] {
  const names = new Set(values.flatMap((value) => customLinks(value).map((link) => link.name.trim()).filter(Boolean)));
  return [
    ...WBS_COURSE_LINK_FIELDS.map(({ key, label }) => ({ label, url: courseLinkPath(key) })),
    ...[...names].sort((a, b) => a.localeCompare(b, "ko")).map((name) => ({ label: `${name} (커스텀 링크)`, url: courseLinkPath(`custom:${name}`) })),
  ];
}

// Resolve the field at click time so a shared template uses each course's latest URL.
export function resolveSavedCourseLink(course: Record<string, unknown>, key: string): string | null {
  if (!courseLinkLabel(key)) return null;
  let value: unknown;
  if (key.startsWith("custom:")) {
    const matches = customLinks(course.custom_links).filter((link) => link.name.trim() === key.slice(7));
    if (matches.length !== 1) return null;
    value = matches[0].url;
  } else value = course[key];
  if (typeof value !== "string") return null;
  const url = value.trim();
  return validTaskLink({ type: "external", url, label: key }) ? new URL(url).href : null;
}
