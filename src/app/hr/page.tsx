import { HrTaskBoard } from "@/components/hr/hr-task-board";
import { koreaDate, loadWorkspacePeople, requireWorkTaskContext } from "@/lib/work-tasks/server";
import type { WorkDailyReport, WorkTask } from "@/lib/work-tasks/types";

export default async function Page() {
  const { admin, user, workspaceId, isSuperAdmin } = await requireWorkTaskContext();
  const today = koreaDate();
  const query = admin.from("work_tasks").select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "cancelled")
    .lte("planned_date", today)
    .order("status")
    .order("planned_date")
    .order("created_at", { ascending: false });
  const [taskResult, people, reviewResult, reportResult] = await Promise.all([
    query,
    loadWorkspacePeople(workspaceId),
    admin.from("work_daily_reviews").select("checked_out_at,incomplete_count")
      .eq("workspace_id", workspaceId).eq("user_id", user.id).eq("work_date", today).maybeSingle(),
    admin.from("work_daily_reports").select("workspace_id,user_id,work_date,content,created_at,updated_at")
      .eq("workspace_id", workspaceId).eq("work_date", today),
  ]);
  if (taskResult.error) throw taskResult.error;
  if (reportResult.error && reportResult.error.code !== "PGRST205" && reportResult.error.code !== "42P01") throw reportResult.error;
  return <HrTaskBoard
    initialTasks={(taskResult.data ?? []).filter(task => people.some(person => person.id === task.assignee_id)) as WorkTask[]}
    people={people}
    userId={user.id}
    isSuperAdmin={isSuperAdmin}
    today={today}
    initialReview={reviewResult.data}
    initialReports={(reportResult.data ?? []) as WorkDailyReport[]}
  />;
}
