import { randomUUID } from "node:crypto";

import {
  buildRecipientTemplateVariables,
  getTemplateInputVariables,
  parseTemplateVariableValues,
} from "@/lib/messages/custom-template";
import { getMessageProvider } from "@/lib/messages/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const TEST_RECIPIENT = {
  name: "권정인",
  phone: "01023787490",
};

type Context = { params: Promise<{ bookId: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: Context) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      templateId?: string;
      variables?: Record<string, string>;
    };
    if (!body.templateId) {
      return Response.json(
        { message: "테스트할 템플릿을 선택해 주세요." },
        { status: 400 },
      );
    }

    const [{ data: book }, { data: template }] = await Promise.all([
      supabase
        .from("address_books")
        .select("id,workspace_id")
        .eq("id", bookId)
        .maybeSingle(),
      supabase
        .from("message_templates")
        .select(
          "id,name,template_code,send_type,applicant_variable,course_variable,variable_names",
        )
        .eq("id", body.templateId)
        .maybeSingle(),
    ]);
    if (!book) {
      return Response.json(
        { message: "주소록을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (!template) {
      return Response.json(
        { message: "템플릿을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const inputVariables = parseTemplateVariableValues(
      body.variables,
      getTemplateInputVariables(
        template.applicant_variable,
        Array.isArray(template.variable_names) && template.variable_names.length
          ? (template.variable_names as string[])
          : template.course_variable,
      ),
    );
    const admin = createAdminClient();
    const provider = getMessageProvider();
    provider.validateCustomSendType(template.send_type);
    const messageJobId = randomUUID();
    const { error: jobError } = await admin
      .from("address_book_message_jobs")
      .insert({
        id: messageJobId,
        workspace_id: book.workspace_id,
        address_book_id: bookId,
        template_id: template.id,
        template_code: template.template_code,
        provider: provider.name,
        course_name: inputVariables[template.course_variable] ?? "",
        target_scope: "test",
        requested_by: user.id,
        requested_count: 1,
      });
    if (jobError)
      throw new Error(`테스트 발송 작업 저장 실패: ${jobError.code}`);

    const { data: recipient, error: recipientError } = await admin
      .from("address_book_message_recipients")
      .insert({
        message_job_id: messageJobId,
        recipient_name: TEST_RECIPIENT.name,
        normalized_phone: TEST_RECIPIENT.phone,
        provider: provider.name,
      })
      .select("id")
      .single();
    if (recipientError || !recipient) {
      throw new Error(
        `테스트 수신자 저장 실패: ${recipientError?.code ?? "UNKNOWN"}`,
      );
    }

    const requestedAt = new Date().toISOString();
    const result = await provider.sendCustomMessage({
      phone: TEST_RECIPIENT.phone,
      templateCode: template.template_code,
      sendType: template.send_type,
      variables: buildRecipientTemplateVariables(
        inputVariables,
        template.applicant_variable,
        TEST_RECIPIENT.name,
      ),
      idempotencyKey: `address-book-test:${messageJobId}:${recipient.id}`,
    });
    const deliveryPending = result.ok && result.deliveryPending;
    const status = deliveryPending
      ? "processing"
      : result.ok
        ? "completed"
        : "failed";
    await Promise.all([
      admin
        .from("address_book_message_recipients")
        .update({
          status: deliveryPending
            ? "unknown"
            : result.ok
              ? "success"
              : result.unknown
                ? "unknown"
                : "failed",
          http_status: result.status,
          shoong_code: result.code ?? null,
          provider: result.provider,
          provider_correlation_id: result.correlationId ?? null,
          provider_status: result.providerStatus ?? null,
          delivery_checked_at:
            result.provider === "directalk" && !deliveryPending
              ? requestedAt
              : null,
          group_id: result.groupId ?? null,
          message_id: result.messageId ?? null,
          failure_reason: deliveryPending ? null : result.reason ?? null,
          requested_at: requestedAt,
          completed_at: deliveryPending ? null : new Date().toISOString(),
        })
        .eq("id", recipient.id),
      admin
        .from("address_book_message_jobs")
        .update({
          status,
          success_count: result.ok && !deliveryPending ? 1 : 0,
          failed_count: result.ok ? 0 : 1,
          completed_at: deliveryPending ? null : new Date().toISOString(),
        })
        .eq("id", messageJobId),
    ]);

    if (!result.ok) {
      return Response.json(
        {
          message: result.reason ?? "테스트 발송에 실패했습니다.",
          httpStatus: result.status,
          shoongCode: result.code,
          provider: result.provider,
          correlationId: result.correlationId ?? null,
        },
        { status: 400 },
      );
    }

    return Response.json({
      message: `${TEST_RECIPIENT.name}(${TEST_RECIPIENT.phone})에게 테스트 발송했습니다.`,
      messageJobId,
      provider: result.provider,
      correlationId: result.correlationId ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "테스트 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
