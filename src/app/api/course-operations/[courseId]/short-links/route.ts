import { z } from "zod";
import { createShortLink, ShortLinkError } from "@/lib/short-links/client";
import { replayLinkRequest, shortLinkInputSchema } from "@/lib/short-links/model";
import { issueReplayLink } from "@/lib/replay-guide/short-link";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const user = await getAuthenticatedUser(await createClient());
    if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
    const { courseId } = await params;
    if (!z.string().uuid().safeParse(courseId).success) return Response.json({ message: "강의 UUID가 올바르지 않습니다." }, { status: 400, headers });
    const body = await request.json().catch(() => null);
    const parsed = shortLinkInputSchema.omit({ course_id: true }).or(replayLinkRequest.omit({ course_id: true })).safeParse(body);
    if (!parsed.success) return Response.json({ message: "유형 식별자, 연결 주소와 이름을 확인해 주세요." }, { status: 400, headers });
    const membership = await requireCourseOperationsMembership(user.id);
    const admin = createAdminClient();
    const { data: course, error } = await admin.from("courses").select("id,name").eq("id", courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
    if (error) throw new Error("course_lookup_failed");
    if (!course) return Response.json({ message: "강의를 찾을 수 없습니다." }, { status: 404, headers });
    const result = "purpose" in parsed.data
      ? await issueReplayLink(admin, course, new URL(request.url).origin)
      : await createShortLink({ ...parsed.data, course_id: course.id });
    return Response.json(result, { status: result.existing ? 200 : 201, headers });
  } catch (error) {
    return Response.json({ message: error instanceof ShortLinkError ? error.message : "짧은 주소 발급 요청을 처리하지 못했습니다." }, { status: error instanceof ShortLinkError ? error.status : 500, headers });
  }
}
