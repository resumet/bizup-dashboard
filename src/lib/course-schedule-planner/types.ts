export type CourseScheduleDraftSize = "large" | "small";

export type CourseScheduleDraft = {
  id: string;
  instructorName: string;
  topic: string;
  memo: string;
  courseSize: CourseScheduleDraftSize;
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
  holidays: Record<string, string[]>;
};
