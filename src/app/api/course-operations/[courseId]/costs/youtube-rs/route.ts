import { authorizeCourseCosts, courseCostError } from "@/lib/course-costs/server";
import { buildYoutubeRsCostDetails } from "@/lib/course-costs/youtube-rs";
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
    const [appearances, analyzedChannels, orders] = await Promise.all([
      admin
        .from("course_youtube_appearances")
        .select("id,channel_name,channel_url")
        .eq("course_id", courseId)
        .order("sort_order")
        .order("created_at"),
      admin
        .from("youtube_analyzed_channels")
        .select("channel_id,channel,rs_percent")
        .eq("workspace_id", workspaceId)
        .not("rs_percent", "is", null),
      admin
        .from("course_orders")
        .select("id,member_name,rs,current_amount,status")
        .eq("course_id", courseId)
        .neq("rs", ""),
    ]);
    if (appearances.error) throw new Error(`출연 채널 조회 실패: ${appearances.error.code}`);
    if (analyzedChannels.error) throw new Error(`채널 RS 비율 조회 실패: ${analyzedChannels.error.code}`);
    if (orders.error) throw new Error(`결제자 조회 실패: ${orders.error.code}`);

    const details = buildYoutubeRsCostDetails(
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
          rsPercent: row.rs_percent === null ? null : Number(row.rs_percent),
        };
      }),
      (orders.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.member_name ?? ""),
        rsLabel: String(row.rs ?? ""),
        currentAmount: Number(row.current_amount ?? 0),
        status: String(row.status ?? ""),
      })),
    );
    return Response.json({ details }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return courseCostError(error);
  }
}
