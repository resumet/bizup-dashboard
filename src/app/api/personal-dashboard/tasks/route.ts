import { extractAssignedTaskTitle } from "@/lib/personal-dashboard/tasks";
import type { ExecutiveAssignment } from "@/lib/personal-dashboard/types";
import { loadWorkspacePeople, requireWorkTaskContext } from "@/lib/work-tasks/server";

type CreatedAssignment = Omit<ExecutiveAssignment, "creator_name" | "assignee_name">;

export async function POST(request: Request) {
  try {
    const { admin, user, workspaceId, isSuperAdmin, today } = await requireWorkTaskContext();
    if (!isSuperAdmin) {
      return Response.json({ message: "최고관리자만 할일을 배정할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId : "";
    if (!text || text.length > 5000 || !assigneeId) {
      return Response.json({ message: "사용자를 언급하고 할일을 입력해 주세요." }, { status: 400 });
    }

    const people = await loadWorkspacePeople(workspaceId);
    const assignee = people.find((person) => person.id === assigneeId && person.active);
    if (!assignee) {
      return Response.json({ message: "배정할 사용자를 찾을 수 없습니다." }, { status: 400 });
    }

    const parsed = extractAssignedTaskTitle(text, [assignee.name, ...assignee.accountNames]);
    if (!parsed || Array.from(parsed.title).length > 200) {
      return Response.json(
        { message: "선택한 사용자를 @이름으로 언급하고 200자 이하의 할일을 입력해 주세요." },
        { status: 400 },
      );
    }

    const { data, error } = await admin.rpc("create_executive_assignment_with_event", {
      p_workspace_id: workspaceId,
      p_title: parsed.title,
      p_planned_date: today,
      p_creator_id: user.id,
      p_assignee_id: assignee.id,
    });
    if (error) throw error;
    const assignment = data as CreatedAssignment;
    return Response.json({
      ...assignment,
      creator_name: user.displayName ?? "대표",
      assignee_name: assignee.name,
    } satisfies ExecutiveAssignment, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (message === "PERSONNEL_INACTIVE") {
      return Response.json({ message: "이용 권한이 없습니다." }, { status: 403 });
    }
    return Response.json({ message: "할일을 배정하지 못했습니다." }, { status: 500 });
  }
}
