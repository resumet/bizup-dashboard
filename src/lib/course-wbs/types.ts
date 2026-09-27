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
};

export type WbsSummary = {
  courseId: string;
  itemCount: number;
  completedCount: number;
  updatedAt: string;
};

export type CourseWbsBootstrap = {
  courses: WbsCourse[];
  wbsSummaries: WbsSummary[];
  template: WbsTemplate;
  people: string[];
  employeeNames: string[];
};
