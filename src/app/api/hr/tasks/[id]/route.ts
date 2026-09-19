import { requireWorkTaskContext } from "@/lib/work-tasks/server";

function isMissingCommand(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST202" || error?.message?.includes("schema cache");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, user, workspaceId, isSuperAdmin } = await requireWorkTaskContext();
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
    if (!isSuperAdmin && !isAssignee) {
      return Response.json({ message: "담당자만 업무를 변경할 수 있습니다." }, { status: 403 });
    }

    if (body.action === "edit") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!title || title.length > 200 || description.length > 5000) {
        return Response.json({ message: "업무 제목과 설명을 확인해 주세요." }, { status: 400 });
      }
      const command = await admin.rpc("edit_work_task_with_event", {
        p_task_id: id,
        p_workspace_id: workspaceId,
        p_actor_id: user.id,
        p_title: title,
        p_description: description,
        p_is_admin: isSuperAdmin,
      });
      if (!command.error) return Response.json(command.data);
      if (!isMissingCommand(command.error)) throw command.error;

      const { data, error } = await admin.from("work_tasks").update({
        title,
        description,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      if (error) throw error;
      const { error: eventError } = await admin.from("work_task_events").insert({
        task_id: id,
        actor_id: user.id,
        event_type: "edited",
        metadata: {
          previousTitle: task.title,
          title,
          previousDescription: task.description,
          description,
        },
      });
      if (eventError) throw eventError;
      return Response.json(data);
    }

    if (body.action === "status") {
      const status = body.status;
      if (status !== "open" && status !== "done") {
        return Response.json({ message: "업무 상태를 확인해 주세요." }, { status: 400 });
      }
      const command = await admin.rpc("set_work_task_status_with_event", {
        p_task_id: id,
        p_workspace_id: workspaceId,
        p_actor_id: user.id,
        p_status: status,
        p_is_admin: isSuperAdmin,
      });
      if (!command.error) return Response.json(command.data);
      if (!isMissingCommand(command.error)) throw command.error;

      const { data, error } = await admin.from("work_tasks").update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      if (error) throw error;
      const { error: eventError } = await admin.from("work_task_events").insert({
        task_id: id,
        actor_id: user.id,
        event_type: status === "done" ? "completed" : "reopened",
        metadata: {},
      });
      if (eventError) throw eventError;
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
      const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(assigneeId);
      const target = targetResult.user;
      const isBanned = target?.banned_until && new Date(target.banned_until).getTime() > Date.now();
      if (targetError || !target?.email_confirmed_at || isBanned) {
        return Response.json({ message: "활성화된 사용자만 담당자로 선택할 수 있습니다." }, { status: 400 });
      }
      const command = await admin.rpc("transfer_work_task_with_event", {
        p_task_id: id,
        p_workspace_id: workspaceId,
        p_actor_id: user.id,
        p_assignee_id: assigneeId,
        p_note: typeof body.note === "string" ? body.note.trim() : "",
        p_is_admin: isSuperAdmin,
      });
      if (!command.error) return Response.json(command.data);
      if (!isMissingCommand(command.error)) throw command.error;

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, user, workspaceId, isSuperAdmin } = await requireWorkTaskContext();
    const { id } = await params;
    const { data: task, error: taskError } = await admin
      .from("work_tasks")
      .select("id,assignee_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) return Response.json({ message: "업무를 찾을 수 없습니다." }, { status: 404 });
    if (!isSuperAdmin && task.assignee_id !== user.id) {
      return Response.json({ message: "담당자만 업무를 삭제할 수 있습니다." }, { status: 403 });
    }
    const { error } = await admin
      .from("work_tasks")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "업무를 삭제하지 못했습니다." },
      { status: 400 },
    );
  }
}
