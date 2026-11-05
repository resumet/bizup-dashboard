import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export async function POST(request: Request) {
  try {
    const { admin, user, workspaceId } = await requireWorkTaskContext();
    const body = await request.json() as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || Array.from(content).length > 2000) {
      return Response.json(
        { message: "메모는 1자 이상 2,000자 이하로 입력해 주세요." },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("personal_dashboard_memos")
      .insert({ workspace_id: workspaceId, user_id: user.id, content })
      .select("id,content,created_at,updated_at")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (message === "PERSONNEL_INACTIVE") {
      return Response.json({ message: "이용 권한이 없습니다." }, { status: 403 });
    }
    return Response.json({ message: "메모를 저장하지 못했습니다." }, { status: 500 });
  }
}
