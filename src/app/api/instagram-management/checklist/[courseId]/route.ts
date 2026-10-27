import {
  defaultInstagramChecklistTemplateItems,
  instagramChecklistCompletedItemIdsSchema,
  instagramChecklistTemplateItemsSchema,
  mergeInstagramChecklistState,
} from "@/lib/course-documents/instagram-checklist";
import { courseDocumentErrorResponse, requireCourseDocumentMember } from "@/lib/course-documents/server";

export const runtime = "nodejs";

type CourseDocumentContext = Awaited<ReturnType<typeof requireCourseDocumentMember>>;

async function requireWorkspaceCourse(
  admin: CourseDocumentContext["admin"],
  workspaceId: string,
  courseId: string,
) {
  const { data, error } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!data) throw new Error("NOT_FOUND");
}

async function loadTemplate(admin: CourseDocumentContext["admin"], workspaceId: string) {
  const { data, error } = await admin
    .from("instagram_management_checklists")
    .select("items")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`인스타그램 할 일 템플릿 조회 실패: ${error.code}`);
  if (data) return instagramChecklistTemplateItemsSchema.parse(data.items);

  const items = defaultInstagramChecklistTemplateItems();
  const { error: createError } = await admin
    .from("instagram_management_checklists")
    .insert({ workspace_id: workspaceId, items });
  if (createError && createError.code !== "23505") {
    throw new Error(`인스타그램 할 일 템플릿 생성 실패: ${createError.code}`);
  }
  if (!createError) return items;

  const { data: existing, error: existingError } = await admin
    .from("instagram_management_checklists")
    .select("items")
    .eq("workspace_id", workspaceId)
    .single();
  if (existingError) throw new Error(`인스타그램 할 일 템플릿 조회 실패: ${existingError.code}`);
  return instagramChecklistTemplateItemsSchema.parse(existing.items);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const { membership, admin } = await requireCourseDocumentMember();
    await requireWorkspaceCourse(admin, membership.workspace_id, courseId);
    const templateItems = await loadTemplate(admin, membership.workspace_id);
    const { data, error } = await admin
      .from("course_instagram_checklist_states")
      .select("completed_item_ids")
      .eq("course_id", courseId)
      .maybeSingle();
    if (error) throw new Error(`강의 체크리스트 조회 실패: ${error.code}`);
    const completedItemIds = data
      ? instagramChecklistCompletedItemIdsSchema.parse(data.completed_item_ids)
      : [];
    return Response.json({ items: mergeInstagramChecklistState(templateItems, completedItemIds) });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const { user, membership, admin } = await requireCourseDocumentMember();
    await requireWorkspaceCourse(admin, membership.workspace_id, courseId);
    const body = await request.json();
    const requestedCompletedItemIds = instagramChecklistCompletedItemIdsSchema.parse(body.completedItemIds);
    const templateItems = await loadTemplate(admin, membership.workspace_id);
    const templateIds = new Set(templateItems.map((item) => item.id));
    const completedItemIds = requestedCompletedItemIds.filter((id) => templateIds.has(id));
    const { data, error } = await admin
      .from("course_instagram_checklist_states")
      .upsert({
        course_id: courseId,
        completed_item_ids: completedItemIds,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "course_id" })
      .select("completed_item_ids")
      .single();
    if (error) throw new Error(`강의 체크리스트 저장 실패: ${error.code}`);
    const savedCompletedItemIds = instagramChecklistCompletedItemIdsSchema.parse(data.completed_item_ids);
    return Response.json({ items: mergeInstagramChecklistState(templateItems, savedCompletedItemIds) });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
