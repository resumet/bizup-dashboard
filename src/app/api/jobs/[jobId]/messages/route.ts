import { randomUUID } from "node:crypto";

import {
  filterGroupChatNonParticipants,
  filterRosterRows,
} from "@/lib/jobs/filter";
import { loadJobRoster } from "@/lib/jobs/server";
import { EMPTY_ROSTER_FILTERS, type RosterFilters } from "@/lib/jobs/types";
import {
  optionKey,
  optionLabel,
  validateInviteValues,
  type InviteValues,
} from "@/lib/messages/invite";
import { getPhoneSendError } from "@/lib/messages/phone";
import {
  getShoongTemplateCode,
  type ShoongTemplate,
} from "@/lib/shoong/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendRosterMessagesWorkflow } from "@/workflows/roster-message";
import { start } from "workflow/api";

type Context = { params: Promise<{ jobId: string }> };
type RequestBody = {
  scope?: "all" | "filtered" | "selected";
  template?: ShoongTemplate;
  filters?: Partial<RosterFilters>;
  selectedIds?: string[];
  onlyGroupChatNonParticipants?: boolean;
  courseName?: string;
  optionInvites?: Record<string, InviteValues>;
};

export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  let messageJobId: string | null = null;
  try {
    const body = (await request.json()) as RequestBody;
    if (!body.scope || !["all", "filtered", "selected"].includes(body.scope)) {
      return Response.json(
        { message: "발송 대상 범위를 확인해 주세요." },
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

    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
    if (body.scope === "selected" && selectedIds.length === 0) {
      return Response.json(
        { message: "선택한 발송 대상이 없습니다." },
        { status: 400 },
      );
    }

    const filters: RosterFilters = {
      ...EMPTY_ROSTER_FILTERS,
      ...body.filters,
    };
    const optionInvites = body.optionInvites ?? {};
    const { job, rows } = await loadJobRoster(supabase, jobId);
    const selected = new Set(selectedIds);
    const scopeTargets =
      body.scope === "all"
        ? rows
        : body.scope === "filtered"
          ? filterRosterRows(rows, filters)
          : rows.filter((row) => selected.has(row.id));
    const targets = filterGroupChatNonParticipants(
      scopeTargets,
      body.onlyGroupChatNonParticipants === true,
    );
    if (targets.length === 0) {
      return Response.json(
        { message: "발송 대상이 없습니다." },
        { status: 400 },
      );
    }
    if (targets.length > 1_000) {
      return Response.json(
        { message: "한 번에 최대 1,000명까지 발송할 수 있습니다." },
        { status: 400 },
      );
    }
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
    if (targets.length === 1) {
      const phoneError = getPhoneSendError(targets[0].normalizedPhone);
      if (phoneError) {
        return Response.json({ message: phoneError }, { status: 400 });
      }
    }
    const invalid = targets.filter(
      (row) =>
        !row.normalizedPhone ||
        !row.values.customerName ||
        !(
          body.courseName?.trim() ||
          row.values.courseName ||
          job.default_course_name
        ),
    );
    if (invalid.length > 0) {
      return Response.json(
        {
          message: `필수 변수가 없는 대상 ${invalid.length}명이 있습니다. 이름과 강좌명을 확인해 주세요.`,
        },
        { status: 400 },
      );
    }

    const templateCode = getShoongTemplateCode(body.template);
    const admin = createAdminClient();
    messageJobId = randomUUID();
    const idempotencyKey = `manual:${messageJobId}`;
    const { error: jobError } = await admin.from("message_jobs").insert({
      id: messageJobId,
      workspace_id: job.workspace_id,
      course_job_id: job.id,
      job_version: job.latest_version,
      template_key: body.template,
      template_code: templateCode,
      target_scope: body.scope,
      idempotency_key: idempotencyKey,
      status: "processing",
      requested_by: user.id,
      requested_count: targets.length,
    });
    if (jobError) throw new Error(`발송 작업 저장 실패: ${jobError.code}`);

    await start(sendRosterMessagesWorkflow, [
      {
        messageJobId,
        jobId,
        scope: body.scope,
        template: body.template,
        filters,
        selectedIds,
        onlyGroupChatNonParticipants:
          body.onlyGroupChatNonParticipants === true,
        courseName: body.courseName?.trim() || "",
        optionInvites,
      },
    ]);

    return Response.json(
      {
        messageJobId,
        status: "processing",
        message:
          "발송 작업을 시작했습니다. 발송 이력에서 진행상태를 확인해 주세요.",
      },
      { status: 202 },
    );
  } catch (error) {
    if (messageJobId) {
      await createAdminClient()
        .from("message_jobs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", messageJobId);
    }
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "메시지 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
