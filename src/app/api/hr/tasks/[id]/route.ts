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
      const { data, error } = await admin.from("work_tasks").update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      if (error) throw error;
      await admin.from("work_task_events").insert({
        task_id: id,
        actor_id: user.id,
        event_type: status === "done" ? "completed" : "reopened",
        metadata: {},
      });
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
      const { data, error } = await admin.from("work_tasks").update({
        assignee_id: assigneeId,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      if (error) throw error;
      const { error: eventError } = await admin.from("work_task_events").insert({
        task_id: id,
        actor_id: user.id,
        event_type: "transferred",
        from_assignee_id: task.assignee_id,
        to_assignee_id: assigneeId,
        metadata: { note: typeof body.note === "string" ? body.note.trim() : "" },
      });
      if (eventError) throw eventError;
      return Response.json(data);
    }

    return Response.json({ message: "지원하지 않는 변경입니다." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "업무를 변경하지 못했습니다." }, { status: 400 });
  }
}
