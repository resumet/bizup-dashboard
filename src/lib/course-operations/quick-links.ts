export type CourseQuickLink = { label: string; url: string };

export type CourseQuickLinks = {
  id: string;
  name: string;
  instructorName: string;
  links: CourseQuickLink[];
};

export type QuickLinkCourseRow = {
  id: string;
  name: string;
  instructor_name: string;
  landing_page_link: string | null;
  payment_link: string | null;
  course_materials_link: string | null;
  free_kakao_room_1_link: string | null;
  free_kakao_room_2_link: string | null;
  paid_kakao_room_link: string | null;
  communication_room_link: string | null;
  custom_links: unknown;
};

export function openableQuickLink(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function buildCourseQuickLinks(course: QuickLinkCourseRow): CourseQuickLinks {
  const teachingLinks = (Array.isArray(course.custom_links) ? course.custom_links : [])
    .filter((link): link is { name: string; url: string } =>
      !!link && typeof link.name === "string" && typeof link.url === "string" && link.name.includes("교안"),
    );
  const links: CourseQuickLink[] = [
    { label: "무료강의", url: course.landing_page_link ?? "" },
    { label: "유료결제", url: course.payment_link ?? "" },
    { label: "강의자료", url: course.course_materials_link ?? "" },
    { label: "무료카톡방 1", url: course.free_kakao_room_1_link ?? "" },
    { label: "무료카톡방 2", url: course.free_kakao_room_2_link ?? "" },
    { label: "유료수강생단톡방", url: course.paid_kakao_room_link ?? "" },
    { label: "소통방", url: course.communication_room_link ?? "" },
    ...(teachingLinks.length
      ? teachingLinks.map((link) => ({ label: link.name, url: link.url }))
      : [{ label: "교안", url: "" }]),
  ];
  return {
    id: course.id,
    name: course.name,
    instructorName: course.instructor_name.trim() || "강사 미입력",
    links: links.map((link) => ({ ...link, url: openableQuickLink(link.url) })),
  };
}
