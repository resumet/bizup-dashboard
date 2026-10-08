export type MeetingType = {
  id: string;
  name: string;
  code: string | null;
};

export type CalendarCourse = { id: string; name: string; instructor_name: string; cohort: string | null };
export type CalendarPerson = { id: string; name: string; active: boolean };
export type CalendarLocationKind = "online" | "tbd" | "custom";

export type CalendarSourceEvent = {
  id: string;
  source: "webinar" | "leave";
  title: string;
  event_date: string;
  start_minutes: number;
  time_label: string;
  href: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  start_minutes: number;
  duration_minutes: number;
  meeting_type_id: string;
  course_id: string | null;
  notes: string;
  participant_ids: string[];
  location_kind: CalendarLocationKind;
  location_text: string;
  time_tbd: boolean;
  version: number;
  meeting_type: MeetingType;
  course: CalendarCourse | null;
};

export type CalendarDraft = {
  title: string;
  eventDate: string;
  startMinutes: number;
  durationMinutes: number;
  meetingTypeId: string;
  courseId: string | null;
  notes: string;
  participantIds: string[];
  locationKind: CalendarLocationKind;
  locationText: string;
  timeTbd: boolean;
};
