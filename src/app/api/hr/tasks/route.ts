import { koreaDate, requireWorkTaskContext } from "@/lib/work-tasks/server";

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

    const { data: task, error } = await admin.rpc("create_work_task_with_event", {
      p_workspace_id: workspaceId,
      p_title: title,
      p_description: description,
      p_planned_date: plannedDate,
      p_creator_id: user.id,
      p_assignee_id: assigneeId,
    });
    if (error) throw error;
    return Response.json(task, { status: 201 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "업무를 만들지 못했습니다." }, { status: 400 });
  }
}
