import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkerVideoInfo, requireWorkerOnVercel } from "@/lib/tools/youtube-download-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json() as { url?: string };
    const requestedUrl = body.url || "";
    let info = await getWorkerVideoInfo(requestedUrl);
    if (!info) {
      if (process.env.VERCEL) requireWorkerOnVercel();
      const localDownloader = await import("@/lib/tools/youtube-download-server");
      info = await localDownloader.getYoutubeVideoInfo(requestedUrl);
    }
    return Response.json({ info });
  } catch (error) {
    console.error("[youtube-download/info]", error);
    return Response.json({ error: error instanceof Error ? error.message : "영상 정보를 확인하지 못했습니다." }, { status: 400 });
  }
}
