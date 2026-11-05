export type ExecutiveAssignmentStatus = "created" | "assigned" | "completed";

export type PersonalDashboardPerson = {
  id: string;
  name: string;
};

export type ExecutiveAssignment = {
  id: string;
  title: string;
  status: ExecutiveAssignmentStatus;
  creator_id: string;
  creator_name: string;
  assignee_id: string;
  assignee_name: string;
  completion_report: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
