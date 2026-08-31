export type CourseIntakeInput = {
  courseName: string;
  instructorName: string;
  freeWebinarAt: string;
  startsAt: string;
};

export const COURSE_INTAKE_WEBINAR_TIME_OPTIONS = WEBINAR_TIME_OPTIONS;

const WEBINAR_TIMES = new Set<string>(
  COURSE_INTAKE_WEBINAR_TIME_OPTIONS.map((option) => option.value),
);

function text(value: unknown, label: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label}을(를) 입력해 주세요.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function dateOnly(value: unknown, label: string) {
  const normalized = text(value, label, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
  if (!match) throw new Error(`${label} 형식을 확인해 주세요.`);
  const [, year, month, day] = match;
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    calendarDate.getUTCFullYear() !== Number(year) ||
    calendarDate.getUTCMonth() + 1 !== Number(month) ||
    calendarDate.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${label} 형식을 확인해 주세요.`);
  }
  return normalized;
}

export function parseCourseIntakeInput(value: unknown): CourseIntakeInput {
  const input =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const freeWebinarDate = dateOnly(input.freeWebinarDate, "무료 웨비나 날짜");
  const freeWebinarTime = text(input.freeWebinarTime, "무료 웨비나 시간", 5);
  if (!WEBINAR_TIMES.has(freeWebinarTime)) {
    throw new Error("무료 웨비나 시간을 선택해 주세요.");
  }
  const startsDate = dateOnly(input.startsDate, "개강일");
  return {
    courseName: text(input.courseName, "강의명", 200),
    instructorName: text(input.instructorName, "강사명", 120),
    freeWebinarAt: koreaDateTimeToIso(freeWebinarDate, freeWebinarTime),
    startsAt: koreaDateToIso(startsDate),
  };
}
import {
  koreaDateTimeToIso,
  koreaDateToIso,
  WEBINAR_TIME_OPTIONS,
} from "@/lib/course-operations/schedule";
