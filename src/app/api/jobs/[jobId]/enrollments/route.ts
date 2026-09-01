import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseManualEnrollmentInput } from "@/lib/jobs/manual-enrollment";

export const runtime = "nodejs";
export const maxDuration = 120;

type Context = { params: Promise<{ jobId: string }> };
type RequestBody = { selectedIds?: string[] };

type EnrollmentRecord = {
  id: string;
  student_id: string | null;
  normalized_phone: string | null;
  normalized_values: Record<string, unknown>;
  original_values: Record<string, unknown>;
  source_row_number: number;
};

async function loadAllEnrollments(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  version: number,
) {
  const rows: EnrollmentRecord[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await admin
      .from("job_enrollments")
      .select(
        "id,student_id,normalized_phone,normalized_values,original_values,source_row_number",
      )
      .eq("job_id", jobId)
      .eq("version", version)
      .order("source_row_number")
      .range(start, start + 999);
    if (error) throw new Error(`현재 명단 조회 실패: ${error.code}`);
    rows.push(...((data ?? []) as EnrollmentRecord[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

export async function POST(request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const input = parseManualEnrollmentInput(await request.json());
    const { data: job } = await supabase
      .from("course_jobs")
      .select(
        "id,workspace_id,default_course_name,latest_version,valid_count",
      )
      .eq("id", jobId)
      .maybeSingle();
    if (!job) {
      return Response.json(
        { message: "작업을 찾을 수 없거나 접근 권한이 없습니다." },
        { status: 404 },
      );
    }

    const admin = createAdminClient();
    const [existingResult, lastRowResult] = await Promise.all([
      admin
        .from("job_enrollments")
        .select("id")
        .eq("job_id", jobId)
        .eq("version", job.latest_version)
        .eq("normalized_phone", input.normalizedPhone)
        .limit(1)
        .maybeSingle(),
      admin
        .from("job_enrollments")
        .select("source_row_number,normalized_values")
        .eq("job_id", jobId)
        .eq("version", job.latest_version)
        .order("source_row_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (existingResult.error || lastRowResult.error) {
      throw new Error(
        `현재 명단 조회 실패: ${existingResult.error?.code ?? lastRowResult.error?.code}`,
      );
    }
    if (existingResult.data) {
      return Response.json(
        { message: "현재 명단에 같은 연락처가 이미 등록되어 있습니다." },
        { status: 409 },
      );
    }

    const lastValues =
      lastRowResult.data?.normalized_values &&
      typeof lastRowResult.data.normalized_values === "object" &&
      !Array.isArray(lastRowResult.data.normalized_values)
        ? (lastRowResult.data.normalized_values as Record<string, unknown>)
        : {};
    const courseName =
      job.default_course_name?.trim() ||
      (typeof lastValues.courseName === "string"
        ? lastValues.courseName.trim()
        : "");
    const sourceRowNumber =
      (lastRowResult.data?.source_row_number ?? 1) + 1;
    const normalizedValues = {
      courseName,
      optionName: input.optionName,
      customerName: input.customerName,
      email: input.email,
      phone: input.normalizedPhone,
      referrer: input.referrer,
      source: input.source,
      adMedia: input.adMedia,
      groupChatJoined: false,
      memo: "",
    };

    const { data: student, error: studentError } = await admin
      .from("students")
      .upsert(
        {
          workspace_id: job.workspace_id,
          normalized_phone: input.normalizedPhone,
          name: input.customerName,
          email: input.email || null,
          profile: {
            referrer: input.referrer,
            source: input.source,
            adMedia: input.adMedia,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,normalized_phone" },
      )
      .select("id")
      .single();
    if (studentError || !student) {
      throw new Error(`수강생 저장 실패: ${studentError?.code ?? "UNKNOWN"}`);
    }

    const { data: enrollment, error: enrollmentError } = await admin
      .from("job_enrollments")
      .insert({
        job_id: jobId,
        version: job.latest_version,
        student_id: student.id,
        normalized_phone: input.normalizedPhone,
        normalized_values: normalizedValues,
        original_values: {
          이름: input.customerName,
          연락처: input.normalizedPhone,
          이메일: input.email,
          옵션명: input.optionName,
          추천인: input.referrer,
          "유입 경로": input.source,
          "광고 매체": input.adMedia,
        },
        source_row_number: sourceRowNumber,
        is_duplicate: false,
      })
      .select("id")
      .single();
    if (enrollmentError || !enrollment) {
      throw new Error(
        `상세 명단 저장 실패: ${enrollmentError?.code ?? "UNKNOWN"}`,
      );
    }

    const { data: updatedJob, error: updateError } = await admin
      .from("course_jobs")
      .update({
        valid_count: job.valid_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("latest_version", job.latest_version)
      .select("id")
      .maybeSingle();
    if (updateError || !updatedJob) {
      await admin.from("job_enrollments").delete().eq("id", enrollment.id);
      throw new Error(
        "명단이 동시에 변경되었습니다. 새로고침한 뒤 다시 추가해 주세요.",
      );
    }

    await admin.from("audit_logs").insert({
      workspace_id: job.workspace_id,
      actor_id: user.id,
      event_type: "course_job.enrollment_added_manually",
      entity_type: "course_job",
      entity_id: jobId,
      metadata: {
        enrollment_id: enrollment.id,
        normalized_phone: input.normalizedPhone,
        version: job.latest_version,
      },
    });

    return Response.json(
      {
        message: `${input.customerName} 수강생을 추가했습니다.`,
        enrollment: {
          id: enrollment.id,
          sourceRowNumber,
          normalizedPhone: input.normalizedPhone,
          isDuplicate: false,
          groupChatJoined: false,
          memo: "",
          values: normalizedValues,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "수강생을 수동으로 추가하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = (await request.json()) as RequestBody;
    const selectedIds = new Set(
      Array.isArray(body.selectedIds)
        ? body.selectedIds.filter((id) => typeof id === "string" && id)
        : [],
    );
    if (selectedIds.size === 0)
      return Response.json(
        { message: "삭제할 수강생을 선택해 주세요." },
        { status: 400 },
      );

    const { data: job } = await supabase
      .from("course_jobs")
      .select("id,workspace_id,latest_version")
      .eq("id", jobId)
      .maybeSingle();
    if (!job)
      return Response.json(
        { message: "작업을 찾을 수 없거나 접근 권한이 없습니다." },
        { status: 404 },
      );

    const admin = createAdminClient();
    const currentRows = await loadAllEnrollments(
      admin,
      jobId,
      job.latest_version,
    );
    const selectedRows = currentRows.filter((row) => selectedIds.has(row.id));
    if (selectedRows.length !== selectedIds.size)
      return Response.json(
        { message: "명단이 변경되었습니다. 새로고침 후 다시 선택해 주세요." },
        { status: 409 },
      );

    const remainingRows = currentRows.filter((row) => !selectedIds.has(row.id));
    if (remainingRows.length === 0)
      return Response.json(
        { message: "전체 명단은 삭제할 수 없습니다. 최소 1명을 남겨 주세요." },
        { status: 400 },
      );

    const phoneCounts = new Map<string, number>();
    remainingRows.forEach((row) => {
      const phone = row.normalized_phone ?? "";
      phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
    });

    const nextVersion = job.latest_version + 1;
    try {
      for (let start = 0; start < remainingRows.length; start += 500) {
        const batch = remainingRows.slice(start, start + 500);
        const { error: insertError } = await admin
          .from("job_enrollments")
          .insert(
            batch.map((row, index) => ({
              job_id: jobId,
              version: nextVersion,
              student_id: row.student_id,
              normalized_phone: row.normalized_phone,
              normalized_values: row.normalized_values,
              original_values: row.original_values,
              source_row_number: start + index + 2,
              is_duplicate:
                (phoneCounts.get(row.normalized_phone ?? "") ?? 0) > 1,
            })),
          );
        if (insertError)
          throw new Error(`새 명단 저장 실패: ${insertError.code}`);
      }

      const { data: updatedJob, error: updateError } = await admin
        .from("course_jobs")
        .update({
          latest_version: nextVersion,
          valid_count: remainingRows.length,
          error_count: 0,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("latest_version", job.latest_version)
        .select("id")
        .maybeSingle();
      if (updateError || !updatedJob)
        throw new Error("명단이 동시에 변경되었습니다. 다시 시도해 주세요.");
    } catch (error) {
      await admin
        .from("job_enrollments")
        .delete()
        .eq("job_id", jobId)
        .eq("version", nextVersion);
      throw error;
    }

    await admin.from("audit_logs").insert({
      workspace_id: job.workspace_id,
      actor_id: user.id,
      event_type: "course_job.enrollments_deleted",
      entity_type: "course_job",
      entity_id: jobId,
      metadata: {
        previous_version: job.latest_version,
        version: nextVersion,
        deleted_count: selectedRows.length,
        remaining_count: remainingRows.length,
      },
    });

    return Response.json({
      message: `${selectedRows.length.toLocaleString("ko-KR")}명을 삭제했습니다.`,
      version: nextVersion,
      deletedCount: selectedRows.length,
      remainingCount: remainingRows.length,
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "선택 항목을 삭제하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
