export type MessageCourse = {
  id: string;
  name: string;
  instructor_name: string;
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
const COURSE_LINK_VARIABLES = new Set(["링크", "링크명"]);

const COURSE_LINK_FIELDS = [
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
  return COURSE_LINK_VARIABLES.has(variable.trim());
}

export function getCourseLinkOptions(course: MessageCourse) {
  return COURSE_LINK_FIELDS.map(([field, label]) => ({
    field,
    label,
    url: String(course[field] ?? "").trim(),
  }));
}
