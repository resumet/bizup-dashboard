import {
  instagramMaterialNotionUrlSchema,
  instagramMaterialPositionSchema,
} from "@/lib/course-operations/instagram-materials";
import { toInstagramMaterial } from "@/lib/course-operations/instagram-materials-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZodError } from "zod";

export const runtime = "nodejs";

type Context = { params: Promise<{ shareId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { shareId } = await params;
    const body = await request.json() as Record<string, unknown>;
    const position = instagramMaterialPositionSchema.parse(body.position);
    const notionUrl = instagramMaterialNotionUrlSchema.parse(body.notionUrl);
    const admin = createAdminClient();
    const { data: share, error: shareError } = await admin
      .from("course_instagram_shares")
      .select("course_id")
      .eq("public_id", shareId)
      .eq("is_public", true)
      .maybeSingle();
    if (shareError || !share) {
      return Response.json({ message: "공개 페이지를 찾을 수 없습니다." }, { status: 404 });
    }

    const { data, error } = await admin
      .from("course_instagram_materials")
      .update({ notion_url: notionUrl, updated_at: new Date().toISOString() })
      .eq("course_id", share.course_id)
      .eq("position", position)
      .select("position,title,notion_url")
      .single();
    if (error || !data) throw new Error(`Notion 공개 주소 저장 실패: ${error?.code ?? "UNKNOWN"}`);
    return Response.json({ material: toInstagramMaterial(data) });
  } catch (error) {
    return Response.json(
      { message: error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Notion 공개 주소를 저장하지 못했습니다." },
      { status: 400 },
    );
  }
}
