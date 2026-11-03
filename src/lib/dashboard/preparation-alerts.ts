import type { CourseSummary } from "@/lib/course-operations/types";

export type PreparationAlert = {
  key: string;
  type: "instagram_filming_plan" | "ad_filming_plan" | "webinar_assets" | "course_materials";
  title: string;
  description: string;
  dueDate: string;
};

type CalendarAlertEvent = { id: string; title: string; event_date: string; meeting_type: { name: string } | { name: string }[] | null };

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function webinarDate(value: string) { return value ? value.slice(0, 10) : ""; }

export function buildPreparationAlerts({ today, events, courses, completedKeys }: {
  today: string; events: CalendarAlertEvent[]; courses: CourseSummary[]; completedKeys: ReadonlySet<string>;
}) {
  const alerts: PreparationAlert[] = [];
  for (const event of events) {
    const meetingType = Array.isArray(event.meeting_type) ? event.meeting_type[0] : event.meeting_type;
    const text = `${event.title} ${meetingType?.name ?? ""}`.replaceAll(" ", "");
    const dueDate = shiftDate(event.event_date, -2);
    if (dueDate > today || event.event_date < today) continue;
    const isInstagram = text.includes("인스타") && text.includes("촬영");
    const isAd = text.includes("광고") && text.includes("촬영");
    if (!isInstagram && !isAd) continue;
    const type = isInstagram ? "instagram_filming_plan" : "ad_filming_plan";
    const key = `calendar:${event.id}:${type}`;
    if (!completedKeys.has(key)) alerts.push({ key, type, dueDate, title: isInstagram ? "인스타그램 기획 확인" : "광고 촬영 기획 확인", description: `${event.event_date} ${event.title} 일정 전 기획 완료 여부를 확인해 주세요.` });
  }
  for (const course of courses.filter((course) => course.status === "ongoing")) {
    const date = webinarDate(course.free_webinar_at);
    if (!date || date < today) continue;
    for (const [type, taskKey, offset, title] of [
      ["webinar_assets", "free-webinar-assets", 25, "광고 소재 준비 확인"],
      ["course_materials", "course-materials", 21, "교안 준비 확인"],
    ] as const) {
      const task = course.required_tasks.find((item) => item.key === taskKey);
      const dueDate = shiftDate(date, -offset);
      const key = `course:${course.id}:${type}`;
      if (!task?.completed && dueDate <= today && !completedKeys.has(key)) alerts.push({ key, type, dueDate, title, description: `${course.instructor_name || course.name} · 웨비나 ${date} 전 준비 상태를 확인해 주세요.` });
    }
  }
  return alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, "ko"));
}
