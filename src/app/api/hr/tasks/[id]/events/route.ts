import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, workspaceId } = await requireWorkTaskContext();
    const { id } = await params;
    const { data: task } = await admin.from("work_tasks").select("id")
      .eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
    if (!task) return Response.json({ message: "업무를 찾을 수 없습니다." }, { status: 404 });
    const { data, error } = await admin.from("work_task_events").select("*")
      .eq("task_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "이력을 불러오지 못했습니다." }, { status: 400 });
  }
}
