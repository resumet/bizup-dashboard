import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDashboardCohort } from "@/lib/dashboard/course-metadata";
import { loadCourseWbsBootstrap } from "@/lib/course-wbs/server";
import { loadWorkspacePeople } from "@/lib/work-tasks/server";
import type {
  ExecutiveAssignment,
  ExecutiveAssignmentStatus,
  PersonalDashboardMemo,
  PersonalDashboardPerson,
  PersonalWbsTask,
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
  userDisplayName?: string;
  isSuperAdmin: boolean;
};

function normalizedPersonName(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function assignedWbsTasks(
  bootstrap: Awaited<ReturnType<typeof loadCourseWbsBootstrap>>,
  aliases: Set<string>,
) {
  const schedulesByCourse = new Map(
    bootstrap.schedules.map((entry) => [entry.courseId, entry.items]),
  );
  const tasks: PersonalWbsTask[] = [];

  for (const course of bootstrap.courses) {
    if (course.status !== "ongoing") continue;
    for (const item of schedulesByCourse.get(course.id) ?? []) {
      if (item.completed || !aliases.has(normalizedPersonName(item.owner))) continue;
      tasks.push({
        courseId: course.id,
        courseName: course.name,
        instructorName: course.instructorName,
        cohort: formatDashboardCohort(course.cohort),
        itemId: item.id,
        title: item.title,
        scheduledDate: item.dueDate || item.startDate,
        href: `/services/course-wbs?courseId=${encodeURIComponent(course.id)}`,
      });
    }
  }

  return tasks;
}

export async function loadPersonalDashboard(input: LoadPersonalDashboardInput) {
  let taskQuery = input.admin
    .from("work_tasks")
    .select("id,title,status,creator_id,assignee_id,completion_report,completed_at,created_at,updated_at")
    .eq("workspace_id", input.workspaceId)
    .eq("task_kind", "executive_assignment")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!input.isSuperAdmin) taskQuery = taskQuery.eq("assignee_id", input.userId);

  const wbsPromise = loadCourseWbsBootstrap(input.workspaceId)
    .then((value) => ({ value, error: "" }))
    .catch(() => ({ value: null, error: "강의별 할일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }));
  const [memoResult, taskResult, people, wbsResult] = await Promise.all([
    input.admin
      .from("personal_dashboard_memos")
      .select("id,content,created_at,updated_at")
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    taskQuery,
    loadWorkspacePeople(input.workspaceId),
    wbsPromise,
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

  const currentPerson = people.find((person) => person.id === input.userId);
  const aliases = new Set(
    [
      currentPerson?.name,
      ...(currentPerson?.accountNames ?? []),
      input.userDisplayName,
    ]
      .filter((name): name is string => Boolean(name?.trim()))
      .map(normalizedPersonName),
  );

  const wbsTasks = wbsResult.value ? assignedWbsTasks(wbsResult.value, aliases) : [];

  return {
    memos: (memoResult.data ?? []) as PersonalDashboardMemo[],
    assignments,
    people: peopleOptions,
    wbsTasks,
    wbsError: wbsResult.error,
  };
}
