import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { courseOperationsApiError, requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { hasAdminAccess } from "@/lib/admin/access";

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const { courseId } = await params;
    const { data, error } = await createAdminClient().from("courses").select("name,status").eq("id", courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
    if (error) throw new Error("강의 정보를 불러오지 못했습니다.");
    if (!data) throw new Error("NOT_FOUND");
    return Response.json({ ...data, canDelete: hasAdminAccess(user.email, membership.role) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return courseOperationsApiError(error); }
}
