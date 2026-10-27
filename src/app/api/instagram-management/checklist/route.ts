import { instagramChecklistItemsSchema, defaultInstagramChecklistItems } from "@/lib/course-documents/instagram-checklist";
import { courseDocumentErrorResponse, requireCourseDocumentMember } from "@/lib/course-documents/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { membership, admin } = await requireCourseDocumentMember();
    const { data, error } = await admin
      .from("instagram_management_checklists")
      .select("items")
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (error) throw new Error(`인스타그램 할 일 조회 실패: ${error.code}`);

    if (data) {
      return Response.json({ items: instagramChecklistItemsSchema.parse(data.items) });
    }

    const items = defaultInstagramChecklistItems();
    const { data: created, error: createError } = await admin
      .from("instagram_management_checklists")
      .insert({ workspace_id: membership.workspace_id, items })
      .select("items")
      .single();
    if (createError?.code === "23505") {
      const { data: existing, error: existingError } = await admin
        .from("instagram_management_checklists")
        .select("items")
        .eq("workspace_id", membership.workspace_id)
        .single();
      if (existingError) throw new Error(`인스타그램 할 일 조회 실패: ${existingError.code}`);
      return Response.json({ items: instagramChecklistItemsSchema.parse(existing.items) });
    }
    if (createError) throw new Error(`인스타그램 할 일 생성 실패: ${createError.code}`);
    return Response.json({ items: instagramChecklistItemsSchema.parse(created.items) });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user, membership, admin } = await requireCourseDocumentMember();
    const body = await request.json();
    const items = instagramChecklistItemsSchema.parse(body.items);
    const { data, error } = await admin
      .from("instagram_management_checklists")
      .upsert({
        workspace_id: membership.workspace_id,
        items,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" })
      .select("items")
      .single();
    if (error) throw new Error(`인스타그램 할 일 저장 실패: ${error.code}`);
    return Response.json({ items: instagramChecklistItemsSchema.parse(data.items) });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
