import "server-only";
import { z } from "zod";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { draftSchema, newDraft, youtubeId, type VideoOption } from "./model";

export async function salesContext(courseId: string) {
  if (!z.uuid().safeParse(courseId).success) throw new Error("NOT_FOUND");
  const user = await requireCourseOperationsUser(await createClient());
  const membership = await requireCourseOperationsMembership(user.id);
  const admin = createAdminClient();
  const { data: course, error } = await admin.from("courses")
    .select("id,name,instructor_name,payment_link,free_kakao_room_1_link,free_kakao_room_2_link,webinar_youtube_live_url")
    .eq("id", courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
  if (error) throw new Error("강의 정보를 불러오지 못했습니다.");
  if (!course) throw new Error("NOT_FOUND");
  return { admin, workspaceId: membership.workspace_id as string, course };
}

export async function salesVideos(ctx: Awaited<ReturnType<typeof salesContext>>): Promise<VideoOption[]> {
  const { data, error } = await ctx.admin.from("course_youtube_appearances").select("id,channel_name,video_url,upload_date")
    .eq("course_id", ctx.course.id).neq("video_url", "").order("sort_order").order("created_at");
  if (error) throw new Error("출연영상 목록을 불러오지 못했습니다.");
  return (data ?? []).filter(row => youtubeId(row.video_url)).map(row => ({
    id: row.id, url: row.video_url, label: [row.channel_name || "출연영상", row.upload_date].filter(Boolean).join(" · "),
  }));
}

export async function loadSalesEditor(courseId: string) {
  const ctx = await salesContext(courseId);
  const [videos, result] = await Promise.all([salesVideos(ctx),
    ctx.admin.from("course_post_sales_pages").select("revision,draft,public_url").eq("course_id", courseId).maybeSingle()]);
  if (result.error) throw new Error("사후 세일즈 페이지를 불러오지 못했습니다.");
  const { course } = ctx;
  return { course, videos, revision: Number(result.data?.revision ?? 0), publicUrl: String(result.data?.public_url ?? ""),
    draft: result.data ? draftSchema.parse(result.data.draft) : newDraft(course.name, course.free_kakao_room_1_link || course.free_kakao_room_2_link || "", course.webinar_youtube_live_url || "") };
}
