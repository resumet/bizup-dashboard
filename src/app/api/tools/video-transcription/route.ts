import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareSandboxTranscription } from "@/lib/tools/video-transcription-sandbox";
import type { TranscriptionSource } from "@/lib/tools/video-transcription";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = (await request.json()) as Partial<TranscriptionSource> & {
      type?: string;
      url?: string;
      youtubeCookies?: string;
      filename?: string;
      size?: number;
      contentType?: string;
    };
    const source: TranscriptionSource =
      body.type === "youtube"
        ? { type: "youtube", url: body.url ?? "", youtubeCookies: body.youtubeCookies }
        : body.type === "upload"
          ? {
              type: "upload",
              filename: body.filename ?? "",
              size: body.size ?? 0,
              contentType: body.contentType ?? "",
            }
          : (() => {
              throw new Error("영상 입력 방식을 선택해 주세요.");
            })();
    return Response.json(await prepareSandboxTranscription(source));
  } catch (error) {
    console.error("[video-transcription]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "영상 대본을 추출하지 못했습니다." },
      { status: 400 },
    );
  }
}
