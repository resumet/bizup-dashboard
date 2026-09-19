import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, user, workspaceId, isAdmin } = await requireWorkTaskContext();
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const { data: task, error: taskError } = await admin
      .from("work_tasks")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) return Response.json({ message: "업무를 찾을 수 없습니다." }, { status: 404 });

    const isAssignee = task.assignee_id === user.id;
    if (!isAdmin && !isAssignee) {
      return Response.json({ message: "담당자만 업무를 변경할 수 있습니다." }, { status: 403 });
    }

    if (body.action === "status") {
      const status = body.status;
      if (status !== "open" && status !== "done") {
        return Response.json({ message: "업무 상태를 확인해 주세요." }, { status: 400 });
      }
      const { data, error } = await admin.rpc("set_work_task_status_with_event", {
        p_task_id: id,
        p_workspace_id: workspaceId,
        p_actor_id: user.id,
        p_status: status,
        p_is_admin: isAdmin,
      });
      if (error) throw error;
      return Response.json(data);
    }

    if (body.action === "transfer") {
      const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId : "";
      if (!assigneeId || assigneeId === task.assignee_id) {
        return Response.json({ message: "새 담당자를 선택해 주세요." }, { status: 400 });
      }
      const { data: member } = await admin.from("workspace_members").select("user_id")
        .eq("workspace_id", workspaceId).eq("user_id", assigneeId).maybeSingle();
      if (!member) return Response.json({ message: "담당자를 찾을 수 없습니다." }, { status: 400 });
      const { data, error } = await admin.rpc("transfer_work_task_with_event", {
        p_task_id: id,
        p_workspace_id: workspaceId,
        p_actor_id: user.id,
        p_assignee_id: assigneeId,
        p_note: typeof body.note === "string" ? body.note.trim() : "",
        p_is_admin: isAdmin,
      });
      if (error) throw error;
      return Response.json(data);
    }

    return Response.json({ message: "지원하지 않는 변경입니다." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "업무를 변경하지 못했습니다." }, { status: 400 });
  }
}
