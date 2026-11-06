import type { ConfirmedCourseSchedule, CourseScheduleDraft } from "./types";

type PlannedScheduleTextInput = {
  today: string;
  drafts: CourseScheduleDraft[];
  confirmedCourses: ConfirmedCourseSchedule[];
};

type PlannedScheduleItem = {
  date: string;
  kind: "confirmed" | "draft";
  title: string;
  line: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${WEEKDAYS[date.getUTCDay()]})`;
}

function compareItems(a: PlannedScheduleItem, b: PlannedScheduleItem) {
  return a.date.localeCompare(b.date)
    || a.kind.localeCompare(b.kind)
    || a.title.localeCompare(b.title, "ko");
}

export function buildPlannedScheduleText({ today, drafts, confirmedCourses }: PlannedScheduleTextInput) {
  const items: PlannedScheduleItem[] = [
    ...confirmedCourses
      .filter((course) => course.webinarDate >= today)
      .map((course) => ({
        date: course.webinarDate,
        kind: "confirmed" as const,
        title: course.name,
        line: `- 확정 · ${course.name} · ${course.instructorName}${course.cohort ? ` · ${course.cohort}` : ""}`,
      })),
    ...drafts
      .filter((draft) => draft.scheduledDate && draft.scheduledDate >= today)
      .map((draft) => ({
        date: draft.scheduledDate as string,
        kind: "draft" as const,
        title: draft.topic,
        line: `- 예정 · ${draft.topic} · ${draft.instructorName} · ${draft.courseSize === "large" ? "대형 강의" : "소형 강의"}`,
      })),
  ].sort(compareItems);

  if (!items.length) return "현재 일정 이후로 예정된 강의가 없습니다.";

  const lines = ["예정 강의 일정"];
  let previousDate = "";
  for (const item of items) {
    if (item.date !== previousDate) {
      lines.push("", dateLabel(item.date));
      previousDate = item.date;
    }
    lines.push(item.line);
  }
  return lines.join("\n");
}
