import type { CourseStatus } from "@/lib/course-operations/course-status";

export type WbsItem = {
  id: string;
  title: string;
  owner: string;
  stakeholders: string;
  startDate: string;
  dueDate: string;
  description: string;
  completed: boolean;
  position: number;
};

export type CourseWbs = {
  courseId: string;
  items: WbsItem[];
  updatedAt: string;
};

export type WbsTemplate = {
  id: string;
  name: string;
  items: WbsItem[];
  updatedAt: string | null;
  builtIn: boolean;
  sourceUrl?: string;
};

export type WbsCourse = {
  id: string;
  name: string;
  cohort: string;
  instructorName: string;
  webinarAt: string | null;
  status: CourseStatus;
};

export type WbsSummary = {
  courseId: string;
  itemCount: number;
  completedCount: number;
  updatedAt: string;
};

export type WbsScheduleItem = Pick<WbsItem, "id" | "title" | "owner" | "startDate" | "dueDate" | "completed">;

export type WbsScheduleEntry = {
  courseId: string;
  items: WbsScheduleItem[];
};

export type WbsDashboardTask = {
  courseId: string;
  itemId: string;
  title: string;
  owner: string;
  startDate: string;
  dueDate: string;
  scheduledDate: string;
};

export type WbsDashboard = {
  savedWbsCount: number;
  totalItemCount: number;
  completedItemCount: number;
  overdueTasks: WbsDashboardTask[];
  upcomingTasks: WbsDashboardTask[];
  closestUnstartedCourseId: string | null;
};

export type CourseWbsBootstrap = {
  courses: WbsCourse[];
  wbsSummaries: WbsSummary[];
  schedules: WbsScheduleEntry[];
  dashboard: WbsDashboard;
  template: WbsTemplate;
  people: string[];
  employeeNames: string[];
  inactivePeople?: string[];
};
