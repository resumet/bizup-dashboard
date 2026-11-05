import type { ExecutiveAssignmentStatus } from "@/lib/personal-dashboard/types";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";

type AssignmentRow = {
  id: string;
  assignee_id: string;
  completion_report: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, user, workspaceId, isSuperAdmin } = await requireWorkTaskContext();
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const status = body.status as ExecutiveAssignmentStatus;
    const completionReport = typeof body.completionReport === "string"
      ? body.completionReport.trim()
      : "";
    if (status !== "assigned" && status !== "completed") {
      return Response.json({ message: "할일 상태를 확인해 주세요." }, { status: 400 });
    }
    if (Array.from(completionReport).length > 5000) {
      return Response.json({ message: "완료 보고는 5,000자까지 입력할 수 있습니다." }, { status: 400 });
    }

    const { data: taskData, error: taskError } = await admin
      .from("work_tasks")
      .select("id,assignee_id,completion_report")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .eq("task_kind", "executive_assignment")
      .maybeSingle();
    if (taskError) throw taskError;
    const task = taskData as AssignmentRow | null;
    if (!task) return Response.json({ message: "할일을 찾을 수 없습니다." }, { status: 404 });
    if (!isSuperAdmin && task.assignee_id !== user.id) {
      return Response.json({ message: "담당자만 할일을 완료할 수 있습니다." }, { status: 403 });
    }

    const { data, error } = await admin.rpc("set_executive_assignment_status_with_report", {
      p_task_id: id,
      p_workspace_id: workspaceId,
      p_actor_id: user.id,
      p_status: status,
      p_completion_report: status === "completed" ? completionReport : task.completion_report,
    });
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (message === "PERSONNEL_INACTIVE") {
      return Response.json({ message: "이용 권한이 없습니다." }, { status: 403 });
    }
    return Response.json({ message: "할일 상태를 저장하지 못했습니다." }, { status: 500 });
  }
}
