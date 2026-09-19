export type WorkTaskStatus = "open" | "done" | "cancelled";

export type WorkTaskPerson = {
  id: string;
  name: string;
  active: boolean;
};

export type WorkTask = {
  id: string;
  title: string;
  description: string;
  planned_date: string;
  status: WorkTaskStatus;
  creator_id: string;
  assignee_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkTaskEvent = {
  id: number;
  task_id: string;
  actor_id: string;
  event_type: "created" | "completed" | "reopened" | "transferred" | "edited";
  from_assignee_id: string | null;
  to_assignee_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
