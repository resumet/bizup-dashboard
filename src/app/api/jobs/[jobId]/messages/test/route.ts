import { loadJobRoster } from "@/lib/jobs/server";
import { validateInviteValues } from "@/lib/messages/invite";
import {
  getShoongTemplateCode,
  sendShoongMessage,
  type ShoongTemplate,
} from "@/lib/shoong/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TEST_RECIPIENT = {
  name: "권정인",
  phone: "01023787490",
  maskedPhone: "010-****-7490",
} as const;

type Context = { params: Promise<{ jobId: string }> };
type RequestBody = {
  template?: ShoongTemplate;
  courseName?: string;
  entryCode?: string;
  linkName?: string;
};

export async function POST(request: Request, { params }: Context) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = (await request.json()) as RequestBody;
    if (
      !body.template ||
      !["paid_confirm", "paid_invite"].includes(body.template)
    ) {
      return Response.json(
        { message: "테스트할 템플릿을 확인해 주세요." },
        { status: 400 },
      );
    }
    if (body.template === "paid_invite") {
      const errors = validateInviteValues({
        entryCode: body.entryCode ?? "",
        linkName: body.linkName ?? "",
      });
      if (errors.length > 0)
        return Response.json({ message: errors.join("\n") }, { status: 400 });
    }

    const { job } = await loadJobRoster(supabase, jobId);
    const courseName =
      body.courseName?.trim() || job.default_course_name?.trim();
    if (!courseName)
      return Response.json(
        { message: "테스트 발송에 사용할 공통 강좌명을 입력해 주세요." },
        { status: 400 },
      );

    const result = await sendShoongMessage(
      TEST_RECIPIENT.phone,
      body.template,
      {
        customerName: TEST_RECIPIENT.name,
        courseName,
        entryCode: body.entryCode?.trim(),
        linkName: body.linkName?.trim(),
      },
    );

    await createAdminClient()
      .from("audit_logs")
      .insert({
        workspace_id: job.workspace_id,
        actor_id: user.id,
        event_type: "course_job.test_message_sent",
        entity_type: "course_job",
        entity_id: job.id,
        metadata: {
          template: body.template,
          template_code: getShoongTemplateCode(body.template),
          recipient_name: TEST_RECIPIENT.name,
          recipient: TEST_RECIPIENT.maskedPhone,
          success: result.ok,
          http_status: result.status,
          shoong_code: result.code ?? null,
          failure_reason: result.reason ?? null,
          message_id: result.messageId ?? null,
          group_id: result.groupId ?? null,
        },
      });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          message: result.reason ?? "Shoong 테스트 발송에 실패했습니다.",
          recipient: `${TEST_RECIPIENT.name} (${TEST_RECIPIENT.maskedPhone})`,
          httpStatus: result.status,
          shoongCode: result.code ?? null,
          reason: result.reason ?? null,
        },
        { status: 502 },
      );
    }

    return Response.json({
      ok: true,
      recipient: `${TEST_RECIPIENT.name} (${TEST_RECIPIENT.maskedPhone})`,
      httpStatus: result.status,
      shoongCode: result.code ?? null,
      messageId: result.messageId ?? null,
      groupId: result.groupId ?? null,
      reason: result.reason ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "테스트 메시지 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
