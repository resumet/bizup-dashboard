import { z } from "zod";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCreativeSource } from "@/lib/ad-creative/source";
import { loadCreativeData } from "@/lib/ad-creative/server";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function PUT(request: Request) {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const input = z.object({ url: z.string().trim().min(1).max(2048), matchingKeywords: z.string().max(1000), expectedUpdatedAt: z.string() }).parse(await request.json());
    const source = await loadCreativeSource(input.url, input.matchingKeywords);
    const admin = createAdminClient();
    const record = { spreadsheet_url: source.url, rows: source.rows, matching_keywords: source.matchingKeywords, updated_by: user.id, updated_at: new Date().toISOString() };
    const result = input.expectedUpdatedAt
      ? await admin.from("ad_creative_sources").update(record).eq("workspace_id", membership.workspace_id).eq("updated_at", input.expectedUpdatedAt).select("workspace_id").maybeSingle()
      : await admin.from("ad_creative_sources").insert({ ...record, workspace_id: membership.workspace_id }).select("workspace_id").single();
    if (result.error?.code === "23505" || (!result.error && !result.data)) return Response.json({ message: "다른 사용자가 설정을 갱신했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." }, { status: 409 });
    if (result.error) throw new Error("소재성과 데이터를 저장하지 못했습니다.");
    return Response.json(await loadCreativeData(membership.workspace_id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adPerformanceErrorResponse(error); }
}
