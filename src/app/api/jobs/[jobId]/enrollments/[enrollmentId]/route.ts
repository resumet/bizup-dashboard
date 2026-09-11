import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseEnrollmentMemo } from "@/lib/jobs/enrollment-memo";
import { parseManualEnrollmentName } from "@/lib/jobs/manual-enrollment";

type Context = {
  params: Promise<{ jobId: string; enrollmentId: string }>;
};

type RequestBody = {
  groupChatJoined?: boolean;
  isExtraParticipant?: boolean;
  memo?: unknown;
  customerName?: unknown;
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
  const hasCustomerName = Object.prototype.hasOwnProperty.call(body, "customerName");
  if (
    (!hasGroupChatJoined && !hasExtraParticipant && !hasMemo && !hasCustomerName) ||
    (hasGroupChatJoined && typeof body.groupChatJoined !== "boolean") ||
    (hasExtraParticipant && typeof body.isExtraParticipant !== "boolean")
  ) {
    return Response.json(
      { message: "저장할 수강생 정보를 확인해 주세요." },
      { status: 400 },
    );
  }
  let memo: string | undefined;
  let customerName: string | undefined;
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
  if (hasCustomerName) {
    try {
      customerName = parseManualEnrollmentName(body.customerName);
    } catch (error) {
      return Response.json(
        { message: error instanceof Error ? error.message : "이름을 확인해 주세요." },
        { status: 400 },
      );
    }
  }

  const { data: job } = await supabase
    .from("course_jobs")
    .select("id,workspace_id,latest_version")
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
    .select("id,student_id,normalized_values,original_values,is_manually_added")
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
  if (hasCustomerName && !enrollment.is_manually_added) {
    return Response.json(
      { message: "수동으로 추가한 수강생의 이름만 수정할 수 있습니다." },
      { status: 403 },
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
        ...(hasCustomerName ? { customerName } : {}),
        ...(hasGroupChatJoined
          ? { groupChatJoined: body.groupChatJoined }
          : {}),
        ...(hasMemo ? { memo } : {}),
      },
      ...(hasCustomerName
        ? {
            original_values: {
              ...(
                enrollment.original_values &&
                typeof enrollment.original_values === "object" &&
                !Array.isArray(enrollment.original_values)
                  ? enrollment.original_values
                  : {}
              ),
              이름: customerName,
            },
          }
        : {}),
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

  if (hasCustomerName && enrollment.student_id) {
    const { error: studentError } = await admin
      .from("students")
      .update({ name: customerName, updated_at: new Date().toISOString() })
      .eq("id", enrollment.student_id);
    if (studentError) {
      await admin
        .from("job_enrollments")
        .update({
          normalized_values: enrollment.normalized_values,
          original_values: enrollment.original_values,
        })
        .eq("id", enrollmentId)
        .eq("job_id", jobId)
        .eq("version", job.latest_version);
      return Response.json(
        { message: `수강생 원장 이름 저장 실패: ${studentError.code}` },
        { status: 400 },
      );
    }
  }

  if (hasCustomerName) {
    await admin.from("audit_logs").insert({
      workspace_id: job.workspace_id,
      actor_id: user.id,
      event_type: "course_job.manual_enrollment_name_updated",
      entity_type: "course_job",
      entity_id: jobId,
      metadata: {
        enrollment_id: enrollmentId,
        previous_name:
          typeof normalizedValues.customerName === "string"
            ? normalizedValues.customerName
            : null,
        customer_name: customerName,
        version: job.latest_version,
      },
    });
  }

  return Response.json({
    ...(hasGroupChatJoined ? { groupChatJoined: body.groupChatJoined } : {}),
    ...(hasExtraParticipant
      ? { isExtraParticipant: body.isExtraParticipant }
      : {}),
    ...(hasMemo ? { memo } : {}),
    ...(hasCustomerName ? { customerName } : {}),
  });
}
