import { refundDate } from "@/lib/jobs/refund";
import { parseEnrollmentMemo } from "@/lib/jobs/enrollment-memo";
import {
  parseManualEnrollmentInput,
  type ManualEnrollmentInput,
} from "@/lib/jobs/manual-enrollment";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = {
  params: Promise<{ jobId: string; enrollmentId: string }>;
};

const MANUAL_DETAIL_FIELDS = [
  "customerName",
  "phone",
  "email",
  "optionName",
  "referrer",
  "source",
  "adMedia",
] as const;

type ManualDetailField = (typeof MANUAL_DETAIL_FIELDS)[number];
type RequestBody = Partial<Record<ManualDetailField, unknown>> & {
  groupChatJoined?: boolean;
  isExtraParticipant?: boolean;
  memo?: unknown;
  refund?: boolean;
};

function hasOwn(body: RequestBody, field: keyof RequestBody) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

export async function PATCH(request: Request, { params }: Context) {
  const { jobId, enrollmentId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as RequestBody;
  const hasGroupChatJoined = hasOwn(body, "groupChatJoined");
  const hasExtraParticipant = hasOwn(body, "isExtraParticipant");
  const hasRefund = hasOwn(body, "refund");
  const hasMemo = hasOwn(body, "memo");
  const hasManualDetails = MANUAL_DETAIL_FIELDS.some((field) =>
    hasOwn(body, field),
  );
  if (
    (!hasRefund && !hasGroupChatJoined &&
      !hasExtraParticipant &&
      !hasMemo &&
      !hasManualDetails) ||
    (hasRefund && body.refund !== true) ||
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
    .select(
      "id,student_id,normalized_phone,normalized_values,original_values",
    )
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
  if (refundDate(enrollment.normalized_values)) {
    return Response.json({ message: "환불자는 조회만 가능합니다." }, { status: 409 });
  }
  if (hasRefund) {
    const values = { ...enrollment.normalized_values, refundedAt: new Date().toISOString(), refundedBy: user.id };
    const { data: updated, error } = await admin.from("job_enrollments").update({ normalized_values: values })
      .eq("id", enrollmentId).eq("job_id", jobId).eq("version", job.latest_version)
      .is("normalized_values->>refundedAt", null).select("id").maybeSingle();
    if (error || !updated) return Response.json({ message: "환불 상태를 저장하지 못했습니다. 명단을 새로고침해 주세요." }, { status: 409 });
    await admin.from("audit_logs").insert({ workspace_id: job.workspace_id, actor_id: user.id, event_type: "course_job.enrollment_refunded", entity_type: "course_job", entity_id: jobId, metadata: { enrollment_id: enrollmentId, version: job.latest_version } });
    return Response.json({ enrollment: { normalizedPhone: enrollment.normalized_phone, values } });
  }
  const normalizedValues =
    enrollment.normalized_values &&
    typeof enrollment.normalized_values === "object" &&
    !Array.isArray(enrollment.normalized_values)
      ? enrollment.normalized_values
      : {};
  const originalValues =
    enrollment.original_values &&
    typeof enrollment.original_values === "object" &&
    !Array.isArray(enrollment.original_values)
      ? enrollment.original_values
      : {};

  let manualInput: ManualEnrollmentInput | undefined;
  if (hasManualDetails) {
    try {
      manualInput = parseManualEnrollmentInput({
        customerName: hasOwn(body, "customerName")
          ? body.customerName
          : normalizedValues.customerName,
        phone: hasOwn(body, "phone")
          ? body.phone
          : enrollment.normalized_phone,
        email: hasOwn(body, "email") ? body.email : normalizedValues.email,
        optionName: hasOwn(body, "optionName")
          ? body.optionName
          : normalizedValues.optionName,
        referrer: hasOwn(body, "referrer")
          ? body.referrer
          : normalizedValues.referrer,
        source: hasOwn(body, "source") ? body.source : normalizedValues.source,
        adMedia: hasOwn(body, "adMedia")
          ? body.adMedia
          : normalizedValues.adMedia,
      });
    } catch (error) {
      return Response.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "수강생 정보를 확인해 주세요.",
        },
        { status: 400 },
      );
    }
  }

  if (manualInput) {
    const { data: duplicate, error: duplicateError } = await admin
      .from("job_enrollments")
      .select("id")
      .eq("job_id", jobId)
      .eq("version", job.latest_version)
      .eq("normalized_phone", manualInput.normalizedPhone)
      .neq("id", enrollmentId)
      .limit(1)
      .maybeSingle();
    if (duplicateError) {
      return Response.json(
        { message: `연락처 중복 확인 실패: ${duplicateError.code}` },
        { status: 400 },
      );
    }
    if (duplicate) {
      return Response.json(
        { message: "현재 명단에 같은 연락처가 이미 등록되어 있습니다." },
        { status: 409 },
      );
    }
  }

  let studentId = enrollment.student_id;
  if (manualInput) {
    const { data: student, error: studentError } = await admin
      .from("students")
      .upsert(
        {
          workspace_id: job.workspace_id,
          normalized_phone: manualInput.normalizedPhone,
          name: manualInput.customerName,
          email: manualInput.email || null,
          profile: {
            referrer: manualInput.referrer,
            source: manualInput.source,
            adMedia: manualInput.adMedia,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,normalized_phone" },
      )
      .select("id")
      .single();
    if (studentError || !student) {
      return Response.json(
        {
          message: `수강생 원장 저장 실패: ${studentError?.code ?? "UNKNOWN"}`,
        },
        { status: 400 },
      );
    }
    studentId = student.id;
  }

  const savedValues = {
    ...normalizedValues,
    ...(manualInput
      ? {
          customerName: manualInput.customerName,
          phone: manualInput.normalizedPhone,
          email: manualInput.email,
          optionName: manualInput.optionName,
          referrer: manualInput.referrer,
          source: manualInput.source,
          adMedia: manualInput.adMedia,
        }
      : {}),
    ...(hasGroupChatJoined
      ? { groupChatJoined: body.groupChatJoined }
      : {}),
    ...(hasMemo ? { memo } : {}),
  };
  const { data: savedEnrollment, error: updateError } = await admin
    .from("job_enrollments")
    .update({
      normalized_values: savedValues,
      ...(manualInput
        ? {
            student_id: studentId,
            normalized_phone: manualInput.normalizedPhone,
            original_values: {
              ...originalValues,
              이름: manualInput.customerName,
              연락처: manualInput.normalizedPhone,
              이메일: manualInput.email,
              옵션명: manualInput.optionName,
              추천인: manualInput.referrer,
              "유입 경로": manualInput.source,
              "광고 매체": manualInput.adMedia,
            },
          }
        : {}),
      ...(hasExtraParticipant
        ? { is_extra_participant: body.isExtraParticipant }
        : {}),
    })
    .eq("id", enrollmentId)
    .eq("job_id", jobId)
    .eq("version", job.latest_version)
    .is("normalized_values->>refundedAt", null).select("id").maybeSingle();

  if (updateError || !savedEnrollment) {
    return Response.json(
      { message: `수강생 정보 저장 실패: ${updateError?.code ?? "환불 상태 또는 명단 변경"}` },
      { status: 400 },
    );
  }

  if (manualInput) {
    await admin.from("audit_logs").insert({
      workspace_id: job.workspace_id,
      actor_id: user.id,
      event_type: "course_job.manual_enrollment_updated",
      entity_type: "course_job",
      entity_id: jobId,
      metadata: {
        enrollment_id: enrollmentId,
        previous_values: {
          customerName: normalizedValues.customerName ?? null,
          phone: enrollment.normalized_phone,
          email: normalizedValues.email ?? null,
          optionName: normalizedValues.optionName ?? null,
          referrer: normalizedValues.referrer ?? null,
          source: normalizedValues.source ?? null,
          adMedia: normalizedValues.adMedia ?? null,
        },
        updated_values: manualInput,
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
    ...(manualInput
      ? {
          customerName: manualInput.customerName,
          enrollment: {
            normalizedPhone: manualInput.normalizedPhone,
            values: savedValues,
          },
        }
      : {}),
  });
}
