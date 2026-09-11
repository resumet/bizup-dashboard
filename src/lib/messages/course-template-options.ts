export type MessageCourse = {
  id: string;
  name: string;
  instructor_name: string;
  landing_page_link?: string | null;
  custom_links?: unknown;
  free_address_book_id?: string | null;
  free_kakao_room_1_link: string;
  free_kakao_room_2_link: string;
  communication_room_link: string;
  payment_link: string;
  inquiry_link: string;
  curriculum_link: string;
  free_gift_link: string;
  course_viewing_link: string;
};

export function formatCourseSelectionLabel(course: MessageCourse) {
  const instructorName = course.instructor_name.trim();
  return instructorName ? `${instructorName}의 ${course.name}` : course.name;
}

const COURSE_NAME_VARIABLES = new Set(["강의명", "강좌명"]);

const COURSE_LINK_FIELDS = [
  ["landing_page_link", "기본 랜딩페이지"],
  ["free_kakao_room_1_link", "무료카톡방 1번"],
  ["free_kakao_room_2_link", "무료카톡방 2번"],
  ["communication_room_link", "소통방"],
  ["payment_link", "결제링크"],
  ["inquiry_link", "문의하기 링크"],
  ["curriculum_link", "커리큘럼 보기 링크"],
  ["free_gift_link", "무료강의 수강 선물받기 링크"],
  ["course_viewing_link", "강의 시청하기 링크"],
] as const satisfies ReadonlyArray<readonly [keyof MessageCourse, string]>;

export function isCourseNameVariable(variable: string) {
  return COURSE_NAME_VARIABLES.has(variable.trim());
}

export function isCourseLinkVariable(variable: string) {
  const normalized = variable.replace(/[\s_-]+/gu, "");
  return /링크|url|link|홈페이지|웹사이트|(?:웹|접속|입장|결제|신청|시청|참여|사이트)주소/iu.test(normalized);
}

export function isInstructorNameVariable(variable: string) {
  return variable.trim() === "강사명";
}

export function getCourseSelectionVariables(variables: string[], course?: MessageCourse) {
  return Object.fromEntries(variables.flatMap((variable) => {
    if (isCourseNameVariable(variable)) {
      return [[variable, course ? formatCourseSelectionLabel(course) : ""]];
    }
    if (isInstructorNameVariable(variable)) {
      return [[variable, course?.instructor_name.trim() ?? ""]];
    }
    if (isCourseLinkVariable(variable)) return [[variable, ""]];
    return [];
  }));
}

export function getCourseLinkOptions(course: MessageCourse) {
  const fixed = COURSE_LINK_FIELDS.map(([field, label]) => ({
    field,
    label,
    url: String(course[field] ?? "").trim(),
  }));
  const custom = (Array.isArray(course.custom_links) ? course.custom_links : []).flatMap((link, index) => {
    if (!link || typeof link.name !== "string" || typeof link.url !== "string") return [];
    const label = link.name.trim();
    const url = link.url.trim();
    return label && url ? [{ field: `custom:${index}`, label, url }] : [];
  });
  return [...fixed, ...custom];
}

export function getLinkedMessageCourse(courses: MessageCourse[], bookId: string, rosterCourseId?: string | null) {
  const matches = courses.filter((course) => rosterCourseId
    ? course.id === rosterCourseId
    : Boolean(bookId) && course.free_address_book_id === bookId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function getSelectedCourseLinkField(options: { field: string; url: string }[], value: string, selectedField?: string) {
  if (selectedField === "__manual__") return selectedField;
  const selected = options.find((option) => option.field === selectedField && option.url && option.url === value);
  return selected?.field ?? options.find((option) => option.url && option.url === value)?.field ?? (value ? "__manual__" : "");
}
