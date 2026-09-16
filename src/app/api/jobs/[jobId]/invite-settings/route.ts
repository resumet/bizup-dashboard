import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { buildCourseInviteLinks } from "@/lib/messages/course-invite-links";

export const runtime = "nodejs";
type Context = { params: Promise<{ jobId: string }> };
const headers = { "Cache-Control": "no-store" };
const schema = z.object({ invites: z.array(z.object({
  optionName: z.string().min(1).max(500),
  // Allow unfinished drafts; sending validates the actual invitation separately.
  entryCode: z.string().max(100),
  linkName: z.string().max(2048),
})).min(1).max(200) });

async function authorize(jobId: string) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  const { data: job, error } = await supabase.from("course_jobs").select("id,course_id,workspace_id").eq("id", jobId).maybeSingle();
  if (error || !job) return Response.json({ message: "명단을 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404, headers });
  return job;
}

export async function GET(_: Request, { params }: Context) {
  const { jobId } = await params;
  const authorized = await authorize(jobId);
  if (authorized instanceof Response) return authorized;
  const admin = createAdminClient();
  const [settings, course, options] = await Promise.all([
    admin.from("course_job_invites").select("option_name,entry_code,link_name").eq("job_id", jobId),
    authorized.course_id ? admin.from("courses")
      .select("id,paid_kakao_room_link,landing_page_link,free_kakao_room_1_link,free_kakao_room_2_link,communication_room_link,payment_link,inquiry_link,curriculum_link,free_gift_link,course_viewing_link,course_materials_link,custom_links")
      .eq("id", authorized.course_id).eq("workspace_id", authorized.workspace_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    authorized.course_id ? admin.from("course_options").select("name,group_chat_link").eq("course_id", authorized.course_id).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (settings.error || course.error || options.error) return Response.json({ message: "입장정보와 강의 링크를 불러오지 못했습니다." }, { status: 500, headers });
  return Response.json({
    courseId: course.data?.id ?? null,
    links: course.data ? buildCourseInviteLinks(course.data, options.data ?? []) : [],
    optionInvites: Object.fromEntries((settings.data ?? []).map(row => [row.option_name, {
    entryCode: row.entry_code, linkName: row.link_name,
  }])) }, { headers });
}

export async function PATCH(request: Request, { params }: Context) {
  const { jobId } = await params;
  const authorized = await authorize(jobId);
  if (authorized instanceof Response) return authorized;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "입장정보 형식이 올바르지 않습니다." }, { status: 400, headers });
  const rows = [...new Map(parsed.data.invites.map(invite => [invite.optionName, {
    job_id: jobId, option_name: invite.optionName, entry_code: invite.entryCode,
    link_name: invite.linkName, updated_at: new Date().toISOString(),
  }])).values()];
  const { error } = await createAdminClient().from("course_job_invites").upsert(rows, { onConflict: "job_id,option_name" });
  if (error) return Response.json({ message: "입장정보를 저장하지 못했습니다. 다시 저장해 주세요." }, { status: 500, headers });
  return Response.json({ saved: true }, { headers });
}
