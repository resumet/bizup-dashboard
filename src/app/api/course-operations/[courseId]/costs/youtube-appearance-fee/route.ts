import { authorizeCourseCosts, courseCostError } from "@/lib/course-costs/server";
import { buildYoutubeAppearanceFeeCostDetails } from "@/lib/course-costs/youtube-appearance-fee";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ courseId: string }> };

function channelFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { name: "", url: "" };
  const channel = value as Record<string, unknown>;
  return {
    name: typeof channel.name === "string" ? channel.name.trim() : "",
    url: typeof channel.url === "string" ? channel.url.trim() : "",
  };
}

export async function GET(_: Request, { params }: Context) {
  try {
    const user = await getAuthenticatedUser(await createClient());
    if (!user) throw new Error("로그인이 필요합니다.");
    const { courseId } = await params;
    const { admin, workspaceId } = await authorizeCourseCosts(courseId, user.id);
    const [appearances, analyzedChannels] = await Promise.all([
      admin
        .from("course_youtube_appearances")
        .select("id,channel_name,channel_url")
        .eq("course_id", courseId)
        .order("sort_order")
        .order("created_at"),
      admin
        .from("youtube_analyzed_channels")
        .select("channel_id,channel,appearance_fee")
        .eq("workspace_id", workspaceId),
    ]);
    if (appearances.error) throw new Error(`출연 채널 조회 실패: ${appearances.error.code}`);
    if (analyzedChannels.error) throw new Error(`채널 출연료 조회 실패: ${analyzedChannels.error.code}`);

    const details = buildYoutubeAppearanceFeeCostDetails(
      (appearances.data ?? []).map((row) => ({
        id: String(row.id),
        channelName: String(row.channel_name ?? ""),
        channelUrl: String(row.channel_url ?? ""),
      })),
      (analyzedChannels.data ?? []).map((row) => {
        const channel = channelFields(row.channel);
        return {
          channelId: String(row.channel_id),
          channelName: channel.name,
          channelUrl: channel.url,
          appearanceFee: row.appearance_fee === null ? null : Number(row.appearance_fee),
        };
      }),
    );
    return Response.json({ details }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseCostError(error);
  }
}
