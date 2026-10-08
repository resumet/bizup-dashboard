export type MeetingType = {
  id: string;
  name: string;
  code: string | null;
};

export type CalendarCourse = { id: string; name: string; instructor_name: string; cohort: string | null };

export type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  start_minutes: number;
  duration_minutes: number;
  meeting_type_id: string;
  course_id: string | null;
  notes: string;
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
};
