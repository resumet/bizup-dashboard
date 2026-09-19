import { koreaDate, requireWorkTaskContext } from "@/lib/work-tasks/server";

function isMissingCommand(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST202" || error?.message?.includes("schema cache");
}

export async function POST(request: Request) {
  try {
    const { admin, user, workspaceId, isAdmin } = await requireWorkTaskContext();
    const body = await request.json() as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const requestedAssignee = typeof body.assigneeId === "string" ? body.assigneeId : user.id;
    const assigneeId = isAdmin ? requestedAssignee : user.id;
    const plannedDate = typeof body.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(body.plannedDate)
      ? body.plannedDate
      : koreaDate();
    if (!title || title.length > 200 || description.length > 5000) {
      return Response.json({ message: "업무 제목과 설명을 확인해 주세요." }, { status: 400 });
    }
    const { data: assignee } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", assigneeId)
      .maybeSingle();
    if (!assignee) return Response.json({ message: "담당자를 찾을 수 없습니다." }, { status: 400 });

    const command = await admin.rpc("create_work_task_with_event", {
      p_workspace_id: workspaceId,
      p_title: title,
      p_description: description,
      p_planned_date: plannedDate,
      p_creator_id: user.id,
      p_assignee_id: assigneeId,
    });
    if (!command.error) return Response.json(command.data, { status: 201 });
    if (!isMissingCommand(command.error)) throw command.error;

    const { data: task, error } = await admin.from("work_tasks").insert({
      workspace_id: workspaceId,
      title,
      description,
      planned_date: plannedDate,
      creator_id: user.id,
      assignee_id: assigneeId,
    }).select("*").single();
    if (error) throw error;
    const { error: eventError } = await admin.from("work_task_events").insert({
      task_id: task.id,
      actor_id: user.id,
      event_type: "created",
      to_assignee_id: assigneeId,
      metadata: { title, plannedDate },
    });
    if (eventError) {
      await admin.from("work_tasks").delete().eq("id", task.id);
      throw eventError;
    }
    return Response.json(task, { status: 201 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "업무를 만들지 못했습니다." }, { status: 400 });
  }
}
