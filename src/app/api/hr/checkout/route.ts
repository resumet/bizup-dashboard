import { koreaDate, requireWorkTaskContext } from "@/lib/work-tasks/server";

export async function POST() {
  try {
    const { admin, user, workspaceId } = await requireWorkTaskContext();
    const today = koreaDate();
    const { count, error: countError } = await admin.from("work_tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("assignee_id", user.id)
      .eq("status", "open")
      .lte("planned_date", today);
    if (countError) throw countError;
    const checkedOutAt = new Date().toISOString();
    const { data, error } = await admin.from("work_daily_reviews").upsert({
      workspace_id: workspaceId,
      user_id: user.id,
      work_date: today,
      incomplete_count: count ?? 0,
      checked_out_at: checkedOutAt,
    }, { onConflict: "workspace_id,user_id,work_date" }).select("*").single();
    if (error?.code === "PGRST205") {
      return Response.json({ checked_out_at: checkedOutAt, incomplete_count: count ?? 0 });
    }
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "퇴근 확인을 저장하지 못했습니다." }, { status: 400 });
  }
}
