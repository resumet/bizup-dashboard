import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareWorkerDownload, requireWorkerOnVercel } from "@/lib/tools/youtube-download-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const url = new URL(request.url).searchParams.get("url") || "";
    const remoteDownloadUrl = await prepareWorkerDownload(url);
    if (remoteDownloadUrl) return Response.redirect(remoteDownloadUrl, 307);
    if (process.env.VERCEL) requireWorkerOnVercel();
    const [{ createReadStream }, { rm }, { Readable }, { downloadYoutubeVideo }] = await Promise.all([
      import("node:fs"),
      import("node:fs/promises"),
      import("node:stream"),
      import("@/lib/tools/youtube-download-server"),
    ]);
    const file = await downloadYoutubeVideo(url);
    const nodeStream = createReadStream(file.filePath);
    nodeStream.once("close", () => { void rm(file.directory, { recursive: true, force: true }); });
    const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="youtube-video${file.filename.endsWith(".webm") ? ".webm" : ".mp4"}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[youtube-download]", error);
    return Response.json({ error: error instanceof Error ? error.message : "영상을 다운로드하지 못했습니다." }, { status: 400 });
  }
}
