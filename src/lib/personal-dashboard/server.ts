import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadWorkspacePeople } from "@/lib/work-tasks/server";
import type {
  ExecutiveAssignment,
  ExecutiveAssignmentStatus,
  PersonalDashboardMemo,
  PersonalDashboardPerson,
} from "./types";

type ExecutiveAssignmentRow = {
  id: string;
  title: string;
  status: ExecutiveAssignmentStatus;
  creator_id: string;
  assignee_id: string;
  completion_report: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type LoadPersonalDashboardInput = {
  admin: SupabaseClient;
  workspaceId: string;
  userId: string;
  isSuperAdmin: boolean;
};

export async function loadPersonalDashboard(input: LoadPersonalDashboardInput) {
  let taskQuery = input.admin
    .from("work_tasks")
    .select("id,title,status,creator_id,assignee_id,completion_report,completed_at,created_at,updated_at")
    .eq("workspace_id", input.workspaceId)
    .eq("task_kind", "executive_assignment")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!input.isSuperAdmin) taskQuery = taskQuery.eq("assignee_id", input.userId);

  const [memoResult, taskResult, people] = await Promise.all([
    input.admin
      .from("personal_dashboard_memos")
      .select("id,content,created_at,updated_at")
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    taskQuery,
    loadWorkspacePeople(input.workspaceId),
  ]);

  if (memoResult.error) throw new Error(`개인 메모 조회 실패: ${memoResult.error.code}`);
  if (taskResult.error) throw new Error(`개인 할일 조회 실패: ${taskResult.error.code}`);

  const peopleById = new Map(people.map((person) => [person.id, person.name]));
  const peopleOptions: PersonalDashboardPerson[] = people.map((person) => ({
    id: person.id,
    name: person.name,
  }));
  const assignments: ExecutiveAssignment[] = (taskResult.data as ExecutiveAssignmentRow[]).map((task) => ({
    ...task,
    creator_name: peopleById.get(task.creator_id) ?? "대표",
    assignee_name: peopleById.get(task.assignee_id) ?? "사용자",
  }));

  return {
    memos: (memoResult.data ?? []) as PersonalDashboardMemo[],
    assignments,
    people: peopleOptions,
  };
}
