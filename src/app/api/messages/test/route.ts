import {
  buildRecipientTemplateVariables,
  getTemplateVariables,
  parseTemplateVariableValues,
} from "@/lib/messages/custom-template";
import { canMapVariableToRecipientName } from "@/lib/messages/automation-config";
import { sendShoongCustomMessage } from "@/lib/shoong/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const TEST_RECIPIENT = { name: "권정인", phone: "01023787490" };

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      templateId?: string;
      variables?: Record<string, string>;
      recipientNameVariables?: string[];
    };
    if (!body.templateId) {
      return Response.json(
        { message: "테스트할 템플릿을 선택해 주세요." },
        { status: 400 },
      );
    }

    const [{ data: template }, { data: membership }] = await Promise.all([
      supabase
        .from("message_templates")
        .select(
          "id,name,template_code,send_type,applicant_variable,course_variable,variable_names",
        )
        .eq("id", body.templateId)
        .maybeSingle(),
      supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);
    if (!template) {
      return Response.json(
        { message: "템플릿을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (!membership) {
      return Response.json(
        { message: "워크스페이스 권한을 확인해 주세요." },
        { status: 403 },
      );
    }

    const allVariables = getTemplateVariables(
      template.applicant_variable,
      Array.isArray(template.variable_names) && template.variable_names.length
        ? (template.variable_names as string[])
        : template.course_variable,
    );
    const recipientNameVariables = Array.isArray(body.recipientNameVariables)
      ? body.recipientNameVariables.filter(
          (variable) =>
            allVariables.includes(variable) &&
            canMapVariableToRecipientName(variable),
        )
      : [template.applicant_variable];
    const inputVariables = parseTemplateVariableValues(
      body.variables,
      allVariables.filter(
        (variable) => !recipientNameVariables.includes(variable),
      ),
    );
    const result = await sendShoongCustomMessage(
      TEST_RECIPIENT.phone,
      template.template_code,
      template.send_type,
      buildRecipientTemplateVariables(
        inputVariables,
        recipientNameVariables,
        TEST_RECIPIENT.name,
      ),
    );

    await createAdminClient()
      .from("audit_logs")
      .insert({
        workspace_id: membership.workspace_id,
        actor_id: user.id,
        event_type: "message_automation.test_message_sent",
        entity_type: "message_template",
        entity_id: template.id,
        metadata: {
          recipient_name: TEST_RECIPIENT.name,
          recipient_phone: TEST_RECIPIENT.phone,
          template_code: template.template_code,
          send_type: template.send_type,
          success: result.ok,
          http_status: result.status,
          shoong_code: result.code ?? null,
          failure_reason: result.reason ?? null,
        },
      });

    if (!result.ok) {
      return Response.json(
        {
          message: result.reason ?? "테스트 발송에 실패했습니다.",
          httpStatus: result.status,
          shoongCode: result.code,
        },
        { status: 400 },
      );
    }
    return Response.json({
      message: `${TEST_RECIPIENT.name}(010-2378-7490)에게 테스트 발송했습니다.`,
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
