export type CourseInviteLink = { label: string; url: string };

const COURSE_LINKS = [
  ["paid_kakao_room_link", "유료수강생단톡방"],
  ["landing_page_link", "기본 랜딩페이지"],
  ["free_kakao_room_1_link", "무료카톡방 1번"],
  ["free_kakao_room_2_link", "무료카톡방 2번"],
  ["communication_room_link", "소통방"],
  ["payment_link", "결제링크"],
  ["inquiry_link", "문의하기 링크"],
  ["curriculum_link", "커리큘럼 보기 링크"],
  ["free_gift_link", "무료강의 수강 선물받기 링크"],
  ["course_viewing_link", "강의 시청하기 링크"],
  ["course_materials_link", "강의자료"],
] as const;

type CourseLinkSource = Partial<Record<(typeof COURSE_LINKS)[number][0], string | null>> & { custom_links?: unknown };

/** Only the connected course supplies choices; workspace-wide link history is not used. */
export function buildCourseInviteLinks(
  course: CourseLinkSource,
  options: Array<{ name: string; group_chat_link: string | null }> = [],
): CourseInviteLink[] {
  const customLinks = (Array.isArray(course.custom_links) ? course.custom_links : [])
    .filter((link): link is { name: string; url: string } =>
      !!link && typeof link.name === "string" && typeof link.url === "string",
    ).map(link => ({ label: link.name.trim() || "추가 링크", url: link.url }));
  const candidates = [
    ...COURSE_LINKS.map(([field, label]) => ({ label, url: course[field] ?? "" })),
    ...customLinks,
    ...options.map(option => ({ label: `${option.name} 옵션 단톡방`, url: option.group_chat_link ?? "" })),
  ];
  const unique = new Map<string, CourseInviteLink>();
  for (const candidate of candidates) {
    const url = candidate.url.trim();
    try {
      if (!["https:", "http:"].includes(new URL(url).protocol)) continue;
    } catch { continue; }
    if (!unique.has(url)) unique.set(url, { label: candidate.label, url });
  }
  return [...unique.values()];
}
