import { randomUUID } from "node:crypto";

import { selectCombinedRosterMessageTargets } from "@/lib/course-operations/combined-roster";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { EMPTY_ROSTER_FILTERS, type RosterRow } from "@/lib/jobs/types";
import {
  optionKey,
  optionLabel,
  validateInviteValues,
  type InviteValues,
} from "@/lib/messages/invite";
import {
  getMessageProvider,
  type FixedMessageTemplate,
} from "@/lib/messages/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendRosterMessagesWorkflow } from "@/workflows/roster-message";
import { start } from "workflow/api";

type Context = { params: Promise<{ courseId: string }> };
type RequestBody = {
  scope?: "selected";
  template?: FixedMessageTemplate;
  selectedIds?: string[];
  onlyGroupChatNonParticipants?: boolean;
  courseName?: string;
  optionInvites?: Record<string, InviteValues>;
};

type SourceRosterRow = RosterRow & {
  sourceJobId: string;
  sourceJobVersion: number;
};

export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const startedMessageJobIds: string[] = [];
  let pendingMessageJobId: string | null = null;
  try {
    const [{ courseId }, membership, body] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      request.json() as Promise<RequestBody>,
    ]);
    if (body.scope !== "selected") {
      return Response.json(
        { message: "통합 명단에서는 선택한 인원에게만 발송할 수 있습니다." },
        { status: 400 },
      );
    }
    if (
      !body.template ||
      !["paid_confirm", "paid_invite"].includes(body.template)
    ) {
      return Response.json(
        { message: "발송 템플릿을 확인해 주세요." },
        { status: 400 },
      );
    }
    const selectedIds = Array.isArray(body.selectedIds)
      ? [
          ...new Set(
            body.selectedIds.filter((id): id is string => typeof id === "string"),
          ),
        ]
      : [];
    if (selectedIds.length === 0) {
      return Response.json(
        { message: "선택한 발송 대상이 없습니다." },
        { status: 400 },
      );
    }
    if (selectedIds.length > 1_000) {
      return Response.json(
        { message: "한 번에 최대 1,000명까지 발송할 수 있습니다." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const [courseResult, jobsResult] = await Promise.all([
      admin
        .from("courses")
        .select("id,name")
        .eq("id", courseId)
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle(),
      admin
        .from("course_jobs")
        .select("id,latest_version")
        .eq("workspace_id", membership.workspace_id)
        .eq("course_id", courseId),
    ]);
    if (courseResult.error || !courseResult.data) {
      return Response.json(
        { message: "강의를 찾을 수 없거나 접근 권한이 없습니다." },
        { status: 404 },
      );
    }
    if (jobsResult.error) {
      throw new Error(`연결 명단 조회 실패: ${jobsResult.error.code}`);
    }
    const jobs = jobsResult.data ?? [];
    if (jobs.length === 0) {
      return Response.json(
        { message: "강의에 연결된 수강생 명단이 없습니다." },
        { status: 400 },
      );
    }

    const rowsByJob = await Promise.all(
      jobs.map(async (job) => ({
        job,
        rows: await loadJobEnrollmentRows(admin, job.id, job.latest_version),
      })),
    );
    const sourceRows: SourceRosterRow[] = rowsByJob.flatMap(({ job, rows }) =>
      rows.map((row) => ({
        ...row,
        sourceJobId: job.id,
        sourceJobVersion: job.latest_version,
      })),
    );
    const targets = selectCombinedRosterMessageTargets(
      sourceRows,
      selectedIds,
      body.onlyGroupChatNonParticipants === true,
    );
    if (targets.length === 0) {
      return Response.json(
        { message: "발송 대상이 없습니다." },
        { status: 400 },
      );
    }

    const courseName = body.courseName?.trim() || courseResult.data.name.trim();
    const invalid = targets.filter(
      (row) =>
        !row.normalizedPhone ||
        !row.values.customerName ||
        !(courseName || row.values.courseName),
    );
    if (invalid.length > 0) {
      return Response.json(
        {
          message: `필수 변수가 없는 대상 ${invalid.length}명이 있습니다. 이름과 강좌명을 확인해 주세요.`,
        },
        { status: 400 },
      );
    }

    const optionInvites = body.optionInvites ?? {};
    if (body.template === "paid_invite") {
      const targetOptionKeys = [
        ...new Set(targets.map((row) => optionKey(row.values.optionName))),
      ];
      const optionErrors = targetOptionKeys.flatMap((key) =>
        validateInviteValues(
          optionInvites[key] ?? { entryCode: "", linkName: "" },
        ).map((error) => `${optionLabel(key)}: ${error}`),
      );
      if (optionErrors.length > 0) {
        return Response.json(
          { message: optionErrors.join("\n") },
          { status: 400 },
        );
      }
    }

    const targetsByJob = new Map<string, SourceRosterRow[]>();
    for (const target of targets) {
      const current = targetsByJob.get(target.sourceJobId) ?? [];
      current.push(target);
      targetsByJob.set(target.sourceJobId, current);
    }

    const provider = getMessageProvider();
    const templateCode = provider.getFixedTemplateCode(body.template);
    for (const [jobId, jobTargets] of targetsByJob) {
      const messageJobId = randomUUID();
      const sourceJobVersion = jobTargets[0].sourceJobVersion;
      const { error: jobError } = await admin.from("message_jobs").insert({
        id: messageJobId,
        workspace_id: membership.workspace_id,
        course_job_id: jobId,
        job_version: sourceJobVersion,
        template_key: body.template,
        template_code: templateCode,
        provider: provider.name,
        target_scope: "selected",
        idempotency_key: `course:${courseId}:${messageJobId}`,
        status: "processing",
        requested_by: user.id,
        requested_count: jobTargets.length,
      });
      if (jobError) throw new Error(`발송 작업 저장 실패: ${jobError.code}`);

      pendingMessageJobId = messageJobId;
      await start(sendRosterMessagesWorkflow, [
        {
          messageJobId,
          jobId,
          provider: provider.name,
          scope: "selected",
          template: body.template,
          filters: EMPTY_ROSTER_FILTERS,
          selectedIds: jobTargets.map((row) => row.id),
          onlyGroupChatNonParticipants: false,
          courseName,
          optionInvites,
        },
      ]);
      startedMessageJobIds.push(messageJobId);
      pendingMessageJobId = null;
    }

    return Response.json(
      {
        messageJobIds: startedMessageJobIds,
        status: "processing",
        requestedCount: targets.length,
        message: `${targets.length.toLocaleString("ko-KR")}명에게 발송을 시작했습니다.`,
      },
      { status: 202 },
    );
  } catch (error) {
    if (pendingMessageJobId) {
      await createAdminClient()
        .from("message_jobs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", pendingMessageJobId)
        .eq("status", "processing");
    }
    if (startedMessageJobIds.length > 0) {
      return Response.json(
        {
          messageJobIds: startedMessageJobIds,
          status: "processing",
          message: `${startedMessageJobIds.length.toLocaleString("ko-KR")}개 명단의 발송은 시작됐지만 일부 명단은 시작하지 못했습니다. 발송 이력을 확인해 주세요.`,
        },
        { status: 202 },
      );
    }
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "통합 명단 메시지 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
