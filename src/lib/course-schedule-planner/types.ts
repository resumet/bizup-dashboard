export type CourseScheduleDraft = {
  id: string;
  instructorName: string;
  topic: string;
  colorIndex: number;
  scheduledDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmedCourseSchedule = {
  id: string;
  name: string;
  instructorName: string;
  cohort: string;
  webinarDate: string;
};

export type CourseSchedulePlannerData = {
  drafts: CourseScheduleDraft[];
  confirmedCourses: ConfirmedCourseSchedule[];
  today: string;
};

export type CourseScheduleDraftEvent = {
  entity_id: string | null;
  event_type: string;
  metadata: unknown;
  created_at: string;
};
