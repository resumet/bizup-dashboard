import {
  AD_COPY_MODEL,
  AD_PROMPT_VERSION,
  generateAdMaterials,
} from "@/lib/kakao-ad-maker/server";
import { AD_STRATEGIES, type AdProject, type AdStrategy } from "@/lib/kakao-ad-maker/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { project, strategy } = await request.json() as { project: AdProject; strategy?: AdStrategy };
    if (strategy && !AD_STRATEGIES.includes(strategy)) {
      return Response.json({ error: "지원하지 않는 광고 전략입니다." }, { status: 400 });
    }
    const materials = await generateAdMaterials(project, strategy);
    return Response.json({ materials, model: AD_COPY_MODEL, promptVersion: AD_PROMPT_VERSION });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "홍보소재 프롬프트 생성에 실패했습니다." }, { status: 400 });
  }
}
