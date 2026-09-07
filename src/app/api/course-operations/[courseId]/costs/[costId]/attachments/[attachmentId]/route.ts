import { authorizeCourseCosts, courseCostError, loadCourseCosts } from "@/lib/course-costs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ courseId: string; costId: string; attachmentId: string }> };
export async function DELETE(_: Request, { params }: Context) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { courseId, costId, attachmentId } = await params;
    const { admin, locked } = await authorizeCourseCosts(courseId, user.id);
    if (locked) throw new Error("정산이 확정되어 증빙을 삭제할 수 없습니다.");
    const { data } = await admin.from("course_cost_attachments").select("id,storage_path").eq("id", attachmentId).eq("course_cost_id", costId).maybeSingle();
    if (!data) throw new Error("증빙을 찾을 수 없습니다.");
    const { error } = await admin.from("course_cost_attachments").delete().eq("id", attachmentId);
    if (error) throw new Error(`증빙 삭제 실패: ${error.code}`);
    await admin.storage.from("course-cost-evidence").remove([data.storage_path]);
    await admin.from("course_cost_audit_logs").insert({ course_cost_id: costId, course_id: courseId, actor_id: user.id, action: "ATTACHMENT_DELETED", before_data: { attachment_id: attachmentId } });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked: false });
  } catch (error) { return courseCostError(error); }
}
