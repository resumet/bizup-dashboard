import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseEnrollmentMemo } from "@/lib/jobs/enrollment-memo";

type Context = {
  params: Promise<{ jobId: string; enrollmentId: string }>;
};

type RequestBody = {
  groupChatJoined?: boolean;
  isExtraParticipant?: boolean;
  memo?: unknown;
};

export async function PATCH(request: Request, { params }: Context) {
  const { jobId, enrollmentId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as RequestBody;
  const hasGroupChatJoined = Object.prototype.hasOwnProperty.call(
    body,
    "groupChatJoined",
  );
  const hasExtraParticipant = Object.prototype.hasOwnProperty.call(
    body,
    "isExtraParticipant",
  );
  const hasMemo = Object.prototype.hasOwnProperty.call(body, "memo");
  if (
    (!hasGroupChatJoined && !hasExtraParticipant && !hasMemo) ||
    (hasGroupChatJoined && typeof body.groupChatJoined !== "boolean") ||
    (hasExtraParticipant && typeof body.isExtraParticipant !== "boolean")
  ) {
    return Response.json(
      { message: "저장할 수강생 정보를 확인해 주세요." },
      { status: 400 },
    );
  }
  let memo: string | undefined;
  if (hasMemo) {
    try {
      memo = parseEnrollmentMemo(body.memo);
    } catch (error) {
      return Response.json(
        {
          message:
            error instanceof Error ? error.message : "비고를 확인해 주세요.",
        },
        { status: 400 },
      );
    }
  }

  const { data: job } = await supabase
    .from("course_jobs")
    .select("id,latest_version")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) {
    return Response.json(
      { message: "작업을 찾을 수 없거나 접근 권한이 없습니다." },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const { data: enrollment, error: loadError } = await admin
    .from("job_enrollments")
    .select("id,normalized_values")
    .eq("id", enrollmentId)
    .eq("job_id", jobId)
    .eq("version", job.latest_version)
    .maybeSingle();

  if (loadError || !enrollment) {
    return Response.json(
      { message: "수강생 데이터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const normalizedValues =
    enrollment.normalized_values &&
    typeof enrollment.normalized_values === "object" &&
    !Array.isArray(enrollment.normalized_values)
      ? enrollment.normalized_values
      : {};
  const { error: updateError } = await admin
    .from("job_enrollments")
    .update({
      normalized_values: {
        ...normalizedValues,
        ...(hasGroupChatJoined
          ? { groupChatJoined: body.groupChatJoined }
          : {}),
        ...(hasMemo ? { memo } : {}),
      },
      ...(hasExtraParticipant
        ? { is_extra_participant: body.isExtraParticipant }
        : {}),
    })
    .eq("id", enrollmentId)
    .eq("job_id", jobId)
    .eq("version", job.latest_version);

  if (updateError) {
    return Response.json(
      { message: `수강생 정보 저장 실패: ${updateError.code}` },
      { status: 400 },
    );
  }

  return Response.json({
    ...(hasGroupChatJoined ? { groupChatJoined: body.groupChatJoined } : {}),
    ...(hasExtraParticipant
      ? { isExtraParticipant: body.isExtraParticipant }
      : {}),
    ...(hasMemo ? { memo } : {}),
  });
}
