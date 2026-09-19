import {
  deleteCourseScheduleDraft,
  updateCourseScheduleDraft,
} from "@/lib/course-schedule-planner/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ draftId: string }> };

async function context() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return null;
  const membership = await requireCourseOperationsMembership(user.id);
  return { user, membership };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await context();
  if (!auth) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { draftId } = await params;
    const body = await request.json();
    const patch = body && typeof body === "object" ? body : {};
    return Response.json(
      await updateCourseScheduleDraft(
        auth.membership.workspace_id,
        auth.user.id,
        draftId,
        patch,
      ),
    );
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "예비 강의를 수정하지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await context();
  if (!auth) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { draftId } = await params;
    await deleteCourseScheduleDraft(
      auth.membership.workspace_id,
      auth.user.id,
      draftId,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "예비 강의를 삭제하지 못했습니다." },
      { status: 400 },
    );
  }
}
