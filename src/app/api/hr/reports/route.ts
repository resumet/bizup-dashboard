import { koreaDate, requireWorkTaskContext } from "@/lib/work-tasks/server";

export async function PUT(request: Request) {
  try {
    const { admin, user, workspaceId } = await requireWorkTaskContext();
    const body = await request.json() as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (content.length > 10000) {
      return Response.json({ message: "업무보고는 10,000자 이하로 입력해 주세요." }, { status: 400 });
    }
    const workDate = koreaDate();
    const { data, error } = await admin.from("work_daily_reports").upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      work_date: workDate,
      content,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,user_id,work_date" }).select("*").single();
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return Response.json({ message: "업무보고 데이터베이스 마이그레이션을 먼저 적용해 주세요." }, { status: 503 });
    }
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "업무보고를 저장하지 못했습니다." }, { status: 400 });
  }
}
