import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, user, workspaceId } = await requireWorkTaskContext();
    const { id } = await params;
    const { data, error } = await admin
      .from("personal_dashboard_memos")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ message: "메모를 찾을 수 없습니다." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (message === "PERSONNEL_INACTIVE") {
      return Response.json({ message: "이용 권한이 없습니다." }, { status: 403 });
    }
    return Response.json({ message: "메모를 삭제하지 못했습니다." }, { status: 500 });
  }
}
