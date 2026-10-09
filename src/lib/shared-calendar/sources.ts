import { isKoreaDateOnly, toKoreaDate, toKoreaTime } from "@/lib/course-operations/schedule";
import { isDateKey } from "./calendar";
import type { CalendarCourse, CalendarPerson, CalendarSourceEvent } from "./types";
import type { HrLeaveUnit } from "@/lib/hr-leave/types";

export type CalendarWebinar = CalendarCourse & {
  free_webinar_at: string | null;
  status?: string | null;
};
export type CalendarLeave = { id: string; user_id: string; leave_date: string; unit: HrLeaveUnit; status: string };

export function webinarCalendarSource(course: CalendarWebinar): CalendarSourceEvent | null {
  if (course.status === "on_hold" || course.status === "canceled") return null;
  if (!course.free_webinar_at) return null;
  const date = toKoreaDate(course.free_webinar_at);
  if (!isDateKey(date)) return null;
  const time = toKoreaTime(course.free_webinar_at);
  const timeUnknown = isKoreaDateOnly(course.free_webinar_at);
  const [hour, minute] = time.split(":").map(Number);
  return {
    id: `webinar:${course.id}`, source: "webinar",
    title: `웨비나 · ${course.name} · ${course.instructor_name}${course.cohort ? ` · ${course.cohort}` : ""}`,
    event_date: date, start_minutes: timeUnknown ? 1440 : hour * 60 + minute,
    time_label: timeUnknown ? "시간 미정" : time,
    href: `/services/course-operations/${course.id}`,
  };
}

export function leaveCalendarSources(requests: CalendarLeave[], people: CalendarPerson[]): CalendarSourceEvent[] {
  const activePeople = new Map(people.filter((person) => person.active).map((person) => [person.id, person.name]));
  const labels = { full: "종일 휴가", am: "오전 반차", pm: "오후 반차" };
  return requests.flatMap((request) => {
    const name = activePeople.get(request.user_id);
    if (!name || request.status !== "approved" || !isDateKey(request.leave_date) || !Object.hasOwn(labels, request.unit)) return [];
    return [{ id: `leave:${request.id}`, source: "leave" as const, title: `${name} · ${labels[request.unit]}`,
      event_date: request.leave_date, start_minutes: request.unit === "pm" ? 720 : 0,
      time_label: labels[request.unit], href: `/hr/leave?year=${request.leave_date.slice(0, 4)}` }];
  });
}
