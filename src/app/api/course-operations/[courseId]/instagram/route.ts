import {
  instagramMaterialPositionSchema,
  instagramMaterialTitleSchema,
} from "@/lib/course-operations/instagram-materials";
import {
  ensureCourseInstagramMaterials,
  toInstagramMaterial,
  toInstagramShare,
} from "@/lib/course-operations/instagram-materials-server";
import {
  courseOperationsApiError,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ courseId: string }> };

async function authorizeCourse(courseId: string) {
  const supabase = await createClient();
  const user = await requireCourseOperationsUser(supabase);
  const membership = await requireCourseOperationsMembership(user.id);
  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();
  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!course) throw new Error("NOT_FOUND");
  return admin;
}

async function loadInstagramData(courseId: string) {
  const admin = await authorizeCourse(courseId);
  await ensureCourseInstagramMaterials(admin, courseId);
  const [materialsResult, shareResult] = await Promise.all([
    admin
      .from("course_instagram_materials")
      .select("position,title,notion_url")
      .eq("course_id", courseId)
      .order("position"),
    admin
      .from("course_instagram_shares")
      .select("public_id,is_public")
      .eq("course_id", courseId)
      .single(),
  ]);
  if (materialsResult.error || shareResult.error || !shareResult.data) {
    throw new Error(`인스타 자료 조회 실패: ${materialsResult.error?.code ?? shareResult.error?.code ?? "UNKNOWN"}`);
  }
  return {
    admin,
    materials: materialsResult.data.map(toInstagramMaterial),
    share: toInstagramShare(shareResult.data),
  };
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const { materials, share } = await loadInstagramData(courseId);
    return Response.json({ materials, share }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { courseId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const { admin } = await loadInstagramData(courseId);

    if (body.action === "title") {
      const position = instagramMaterialPositionSchema.parse(body.position);
      const title = instagramMaterialTitleSchema.parse(body.title);
      const { data, error } = await admin
        .from("course_instagram_materials")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("course_id", courseId)
        .eq("position", position)
        .select("position,title,notion_url")
        .single();
      if (error || !data) throw new Error(`인스타 자료 제목 저장 실패: ${error?.code ?? "UNKNOWN"}`);
      return Response.json({ material: toInstagramMaterial(data) });
    }

    if (body.action === "visibility") {
      if (typeof body.isPublic !== "boolean") throw new Error("공개 여부를 확인해 주세요.");
      const { data, error } = await admin
        .from("course_instagram_shares")
        .update({ is_public: body.isPublic, updated_at: new Date().toISOString() })
        .eq("course_id", courseId)
        .select("public_id,is_public")
        .single();
      if (error || !data) throw new Error(`인스타 공개 설정 저장 실패: ${error?.code ?? "UNKNOWN"}`);
      return Response.json({ share: toInstagramShare(data) });
    }

    throw new Error("지원하지 않는 인스타 자료 요청입니다.");
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
