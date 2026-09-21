import {
  createCourseScheduleDraft,
  loadCourseSchedulePlanner,
} from "@/lib/course-schedule-planner/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return null;
  const membership = await requireCourseOperationsMembership(user.id);
  return { user, membership };
}

export async function GET() {
  const auth = await context();
  if (!auth) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  return Response.json(
    await loadCourseSchedulePlanner(auth.membership.workspace_id),
  );
}

export async function POST(request: Request) {
  const auth = await context();
  if (!auth) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json();
    return Response.json(
      await createCourseScheduleDraft(
        auth.membership.workspace_id,
        auth.user.id,
        {
          instructorName: body?.instructorName,
          topic: body?.topic,
          courseSize: body?.courseSize,
        },
      ),
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "예비 강의를 만들지 못했습니다." },
      { status: 400 },
    );
  }
}
