import type { InviteLinkSuggestion } from "@/lib/messages/invite-suggestions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

async function loadAuthorizedJob(jobId: string) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { error: "로그인이 필요합니다.", status: 401 } as const;

  const { data: job } = await supabase
    .from("course_jobs")
    .select("id,workspace_id,default_course_name")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "수강생 작업을 찾을 수 없습니다.", status: 404 } as const;

  return { user, job } as const;
}

export async function GET(_: Request, { params }: Context) {
  const { jobId } = await params;
  const authorized = await loadAuthorizedJob(jobId);
  if ("error" in authorized) {
    return Response.json(
      { message: authorized.error },
      { status: authorized.status },
    );
  }

  const { data, error } = await createAdminClient()
    .from("audit_logs")
    .select("metadata,created_at")
    .eq("workspace_id", authorized.job.workspace_id)
    .eq("event_type", "course_job.invite_link_saved")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    return Response.json(
      { message: `추천 링크 조회 실패: ${error.code}` },
      { status: 400 },
    );
  }

  const suggestions = (data ?? []).flatMap((row): InviteLinkSuggestion[] => {
    const metadata = row.metadata as Record<string, unknown>;
    const courseName = metadata.course_name;
    const optionName = metadata.option_name;
    const linkName = metadata.link_name;
    if (
      typeof courseName !== "string" ||
      typeof optionName !== "string" ||
      typeof linkName !== "string"
    ) {
      return [];
    }
    return [{ courseName, optionName, linkName, usedAt: row.created_at }];
  });

  return Response.json({ suggestions });
}

export async function POST(request: Request, { params }: Context) {
  const { jobId } = await params;
  const authorized = await loadAuthorizedJob(jobId);
  if ("error" in authorized) {
    return Response.json(
      { message: authorized.error },
      { status: authorized.status },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const courseName =
      (typeof body.courseName === "string" ? body.courseName.trim() : "") ||
      authorized.job.default_course_name?.trim() ||
      "";
    const optionName =
      typeof body.optionName === "string" ? body.optionName.trim() : "";
    const linkName =
      typeof body.linkName === "string" ? body.linkName.trim() : "";
    const url = new URL(linkName);
    if (url.protocol !== "https:") throw new Error();
    if (!courseName) {
      return Response.json(
        { message: "추천을 저장할 강의명이 필요합니다." },
        { status: 400 },
      );
    }

    const usedAt = new Date().toISOString();
    const { error } = await createAdminClient().from("audit_logs").insert({
      workspace_id: authorized.job.workspace_id,
      actor_id: authorized.user.id,
      event_type: "course_job.invite_link_saved",
      entity_type: "course_job",
      entity_id: authorized.job.id,
      metadata: {
        course_name: courseName,
        option_name: optionName,
        link_name: url.toString(),
      },
      created_at: usedAt,
    });
    if (error) throw new Error(`추천 링크 저장 실패: ${error.code}`);

    return Response.json({
      suggestion: { courseName, optionName, linkName: url.toString(), usedAt },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error && error.message
            ? error.message
            : "HTTPS 형식의 카톡방 링크를 입력해 주세요.",
      },
      { status: 400 },
    );
  }
}
