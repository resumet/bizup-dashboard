import { formatDashboardCohort } from "../dashboard/course-metadata";
import { toKoreaDate } from "./schedule";
import { formatWebinarCountdownLabel } from "./webinar-proximity";

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

export function formatCourseDetailSubtitle(
  { cohort, instructorName, webinarAt }: { cohort: string | null; instructorName: string | null; webinarAt: string | null },
  todayKoreaDate = toKoreaDate(new Date().toISOString()),
) {
  const parts = [formatDashboardCohort(cohort), instructorName?.trim() || "강사 미지정"];
  const countdown = formatWebinarCountdownLabel(webinarAt ?? "", todayKoreaDate);
  if (webinarAt && countdown) {
    const date = new Date(webinarAt);
    parts.push(countdown, WEBINAR_DATE_FORMATTER.format(date), WEBINAR_TIME_FORMATTER.format(date));
  } else {
    parts.push("웨비나 일정 미정");
  }
  return parts.join(" • ");
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
