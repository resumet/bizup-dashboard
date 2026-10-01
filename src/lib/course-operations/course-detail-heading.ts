type CourseDetailHeadingInput = {
  cohort: string | null;
  instructorName: string | null;
  courseName: string;
  webinarAt: string;
};

const WEBINAR_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const WEBINAR_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "numeric",
  minute: "2-digit",
});

export function formatCourseDetailHeading({
  cohort,
  instructorName,
  courseName,
  webinarAt,
}: CourseDetailHeadingInput) {
  const webinarDate = new Date(webinarAt);

  return [
    cohort ? `${cohort}기` : "기수 미지정",
    instructorName || "강사 미지정",
    courseName,
    WEBINAR_DATE_FORMATTER.format(webinarDate),
    WEBINAR_TIME_FORMATTER.format(webinarDate),
  ].join(" • ");
}

export function formatStudentSettlementHeading({
  cohort,
  instructorName,
  courseName,
  webinarAt,
}: CourseDetailHeadingInput) {
  const webinarDate = new Date(webinarAt);
  return [
    cohort ? `${cohort}기` : "기수 미지정",
    courseName,
    instructorName || "강사 미지정",
    WEBINAR_DATE_FORMATTER.format(webinarDate),
    WEBINAR_TIME_FORMATTER.format(webinarDate),
  ].join(" • ");
}
