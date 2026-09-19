import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { HrTaskBoard } from "@/components/hr/hr-task-board";

export default async function Page() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  const { data: membership } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", user!.id).limit(1).maybeSingle();
  const { data: tasks } = membership ? await supabase.from("work_tasks").select("id,title,description,planned_date,status,assignee_id,creator_id").eq("workspace_id", membership.workspace_id).order("planned_date") : { data: [] };
  return <HrTaskBoard initialTasks={tasks ?? []} userId={user!.id} workspaceId={membership?.workspace_id ?? ""} />;
}
