import { calendarShareText } from "./calendar";
import type { CalendarEvent } from "./types";

const MINUTE = 60_000;

function compactDate(date: Date, timed: boolean) {
  return date.toISOString().replace(/[-:]/gu, "").slice(0, timed ? 15 : 8);
}

/** Opens Google's account picker and event form; it never writes to a calendar through an API. */
export function buildGoogleCalendarUrl(event: CalendarEvent) {
  const day = new Date(`${event.event_date}T00:00:00Z`);
  // These are Seoul wall-clock values, calculated in UTC to ignore the browser's timezone.
  const start = new Date(day.getTime() + (event.time_tbd ? 0 : event.start_minutes * MINUTE));
  const end = new Date(start.getTime() + (event.time_tbd ? 1440 : event.duration_minutes) * MINUTE);
  const draft = {
    title: event.title, eventDate: event.event_date, startMinutes: event.start_minutes,
    durationMinutes: event.duration_minutes, meetingTypeId: event.meeting_type_id, courseId: event.course_id,
    notes: event.notes, participantIds: event.participant_ids,
    locationKind: event.location_kind, locationText: event.location_text, timeTbd: event.time_tbd,
  };
  const calendarUrl = new URL("https://calendar.google.com/calendar/render");
  calendarUrl.search = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compactDate(start, !event.time_tbd)}/${compactDate(end, !event.time_tbd)}`,
    ctz: "Asia/Seoul",
    location: event.location_kind === "custom" ? event.location_text : event.location_kind === "online" ? "온라인" : "",
    details: calendarShareText(draft, {
      meetingType: event.meeting_type.name,
      course: event.course ? `${event.course.name} · ${event.course.instructor_name}` : undefined,
      participants: [],
    }),
  }).toString();
  const accountUrl = new URL("https://accounts.google.com/AccountChooser");
  accountUrl.search = new URLSearchParams({ service: "cl", continue: calendarUrl.toString() }).toString();
  return accountUrl.toString();
}
