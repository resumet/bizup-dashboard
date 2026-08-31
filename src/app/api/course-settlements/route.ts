import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceForUser, settlementError } from "@/lib/course-settlements/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json() as { courseId?: string; managerName?: string };
    if (!body.courseId) throw new Error("강의 ID가 필요합니다.");
    const { admin, workspaceId } = await getWorkspaceForUser(user.id);
    const { data: course } = await admin.from("courses").select("id,name,instructor_name,starts_at").eq("id", body.courseId).eq("workspace_id", workspaceId).maybeSingle();
    if (!course) throw new Error("강의를 찾을 수 없습니다.");
    const existing = await admin.from("course_settlement_projects").select("id").eq("course_id", course.id).maybeSingle();
    if (existing.data) return Response.json({ id: existing.data.id });
    const { data, error } = await admin.from("course_settlement_projects").insert({
      workspace_id: workspaceId,
      course_id: course.id,
      name: `${course.name} 정산`,
      starts_on: String(course.starts_at).slice(0, 10),
      manager_name: String(body.managerName ?? "").trim().slice(0, 100),
      created_by: user.id,
    }).select("id").single();
    if (error || !data) throw new Error(error?.code === "PGRST205" ? "강의별 정산 DB 마이그레이션을 먼저 적용해 주세요." : `정산 생성 실패: ${error?.code}`);
    await admin.from("audit_logs").insert({ workspace_id: workspaceId, actor_id: user.id, event_type: "course_settlement.created", entity_type: "course_settlement", entity_id: data.id, metadata: { course_id: course.id } });
    return Response.json({ id: data.id }, { status: 201 });
  } catch (error) { return settlementError(error); }
}
