import { HrTaskBoard } from "@/components/hr/hr-task-board";
import { koreaDate, loadWorkspacePeople, requireWorkTaskContext } from "@/lib/work-tasks/server";
import type { WorkTask } from "@/lib/work-tasks/types";

export default async function Page() {
  const { admin, user, workspaceId, isAdmin } = await requireWorkTaskContext();
  const today = koreaDate();
  let query = admin.from("work_tasks").select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "cancelled")
    .lte("planned_date", today)
    .order("status")
    .order("planned_date")
    .order("created_at", { ascending: false });
  if (!isAdmin) query = query.eq("assignee_id", user.id);
  const [taskResult, people, reviewResult] = await Promise.all([
    query,
    loadWorkspacePeople(workspaceId),
    admin.from("work_daily_reviews").select("checked_out_at,incomplete_count")
      .eq("workspace_id", workspaceId).eq("user_id", user.id).eq("work_date", today).maybeSingle(),
  ]);
  if (taskResult.error) throw taskResult.error;
  return <HrTaskBoard
    initialTasks={(taskResult.data ?? []) as WorkTask[]}
    people={people}
    userId={user.id}
    isAdmin={isAdmin}
    today={today}
    initialReview={reviewResult.data}
  />;
}
