import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { recent30Engagement, type StoredEngagementVideo } from "@/lib/youtube-analyzer/refresh-engagement";

export const maxDuration = 120;

const PAGE_SIZE = 100;
const CONCURRENCY = 10;
const MAX_RETRIES = 3;

function missingExclusionColumn(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

type ChannelRow = {
  position: number | string;
  channel_id: string;
  metrics: Record<string, unknown>;
  last_analysis_started_at: string;
  last_analyzed_at: string;
};

class RefreshConflict extends Error {
  constructor() { super("REFRESH_CONFLICT"); }
}

async function refreshChannel(admin: SupabaseClient, workspaceId: string, initial: ChannelRow): Promise<boolean> {
  let current: Pick<ChannelRow, "metrics" | "last_analysis_started_at" | "last_analyzed_at"> | null = initial;
  for (let attempt = 0; attempt < MAX_RETRIES && current; attempt++) {
    const videos = await admin.from("youtube_channel_videos")
      .select("video_id,published_at,data")
      .eq("workspace_id", workspaceId)
      .eq("channel_id", initial.channel_id)
      .order("published_at", { ascending: false })
      .order("video_id", { ascending: true })
      .limit(30);
    if (videos.error) throw videos.error;

    const nextMetrics = {
      ...current.metrics,
      ...recent30Engagement(videos.data as StoredEngagementVideo[]),
    };
    // Reanalysis replaces the video snapshot and changes these timestamps.
    // Retry if that happens between reading videos and writing their averages.
    const updated = await admin.from("youtube_analyzed_channels")
      .update({ metrics: nextMetrics })
      .eq("workspace_id", workspaceId)
      .eq("channel_id", initial.channel_id)
      .eq("last_analysis_started_at", current.last_analysis_started_at)
      .eq("last_analyzed_at", current.last_analyzed_at)
      .select("channel_id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return true;

    const latest = await admin.from("youtube_analyzed_channels")
      .select("metrics,last_analysis_started_at,last_analyzed_at")
      .eq("workspace_id", workspaceId)
      .eq("channel_id", initial.channel_id)
      .maybeSingle();
    if (latest.error) throw latest.error;
    current = latest.data;
  }
  if (!current) return false; // The channel was deleted while the refresh was running.
  throw new RefreshConflict();
}

async function settleWithConcurrency<T>(items: T[], run: (item: T) => Promise<boolean>) {
  const results: PromiseSettledResult<boolean>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await run(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }));
  return results;
}

export async function POST(request: Request) {
  let updatedCount = 0;
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const workspaceId = membership.workspace_id;
    const admin = createAdminClient();
    let body: unknown = {};
    try {
      const raw = await request.text();
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const cursor = (body as Record<string, unknown>).cursor;
    if (cursor !== undefined && cursor !== null &&
      (typeof cursor !== "string" || !/^[1-9]\d{0,18}$/.test(cursor) ||
        (cursor.length === 19 && cursor > "9223372036854775807"))) {
      return NextResponse.json({ error: "잘못된 페이지 위치입니다." }, { status: 400 });
    }

    const buildPageQuery = (excludeFlag: boolean) => {
      let query = admin.from("youtube_analyzed_channels")
      .select("position,channel_id,metrics,last_analysis_started_at,last_analyzed_at")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true })
      .limit(PAGE_SIZE + 1);
      if (excludeFlag) query = query.eq("excluded_from_updates", false);
      if (typeof cursor === "string") query = query.gt("position", cursor);
      return query;
    };
    let page = await buildPageQuery(true);
    if (missingExclusionColumn(page.error)) page = await buildPageQuery(false);
    if (page.error) throw page.error;
    const rows = (page.data as ChannelRow[]).slice(0, PAGE_SIZE);

    const settled = await settleWithConcurrency(rows, (row) => refreshChannel(admin, workspaceId, row));
    updatedCount = settled.filter((result) => result.status === "fulfilled" && result.value).length;
    const failed = settled.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;

    const nextCursor = page.data.length > PAGE_SIZE ? String(rows[rows.length - 1].position) : null;

    return NextResponse.json({ updatedCount, nextCursor });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    const conflict = error instanceof RefreshConflict;
    console.error("[youtube-engagement-refresh] failed", {
      code: unauthorized ? "UNAUTHORIZED" : conflict ? "REFRESH_CONFLICT" :
        typeof error === "object" && error && "code" in error ? String(error.code) : "DATABASE_ERROR",
    });
    return NextResponse.json({
      error: unauthorized ? "로그인이 필요합니다."
        : conflict ? "채널이 동시에 변경되어 일부 지표를 갱신하지 못했습니다. 다시 시도해 주세요."
          : "최근 30개 댓글·좋아요 지표를 갱신하지 못했습니다. 다시 시도해 주세요.",
      updatedCount,
    }, { status: unauthorized ? 401 : conflict ? 409 : 500 });
  }
}
