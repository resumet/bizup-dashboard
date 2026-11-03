import { z } from "zod";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";

const schema = z.object({
  key: z.string().min(1).max(300),
  type: z.enum(["instagram_filming_plan", "ad_filming_plan", "webinar_assets", "course_materials"]),
  title: z.string().min(1).max(300),
  description: z.string().max(1000),
  dueDate: z.iso.date(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: "알림 정보를 확인해 주세요." }, { status: 400 });
    const context = await requireWorkTaskContext();
    const { error } = await context.admin.from("dashboard_preparation_alert_completions").upsert({
      workspace_id: context.workspaceId, alert_key: parsed.data.key, alert_type: parsed.data.type,
      title: parsed.data.title, description: parsed.data.description, due_date: parsed.data.dueDate,
      completed_by: context.user.id, completed_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,alert_key", ignoreDuplicates: true });
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return Response.json({ message: status === 401 ? "로그인이 필요합니다." : "알림을 완료 처리하지 못했습니다." }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
    if (!id.success) return Response.json({ message: "알림을 확인해 주세요." }, { status: 400 });
    const context = await requireWorkTaskContext();
    if (!context.isAdmin) return Response.json({ message: "관리자만 완료 기록을 삭제할 수 있습니다." }, { status: 403 });
    const { error } = await context.admin.from("dashboard_preparation_alert_completions").delete().eq("workspace_id", context.workspaceId).eq("id", id.data);
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return Response.json({ message: status === 401 ? "로그인이 필요합니다." : "완료 기록을 삭제하지 못했습니다." }, { status });
  }
}
