import { analyzeReferenceImages } from "@/lib/kakao-ad-maker/server";
import type { AdProject } from "@/lib/kakao-ad-maker/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { project } = await request.json() as { project: AdProject };
    const styleProfile = await analyzeReferenceImages(project);
    return Response.json({ styleProfile });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "참고 이미지 분석에 실패했습니다." }, { status: 400 });
  }
}
