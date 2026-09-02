import { randomUUID } from "node:crypto";

import {
  getTemplateVariables,
  parseTemplateVariableValues,
} from "@/lib/messages/custom-template";
import { canMapVariableToRecipientName } from "@/lib/messages/automation-config";
import { getPhoneSendError } from "@/lib/messages/phone";
import { getMessageProvider } from "@/lib/messages/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendAddressBookMessagesWorkflow } from "@/workflows/address-book-message";
import { start } from "workflow/api";

type Context = { params: Promise<{ bookId: string }> };
export const runtime = "nodejs";

export async function POST(request: Request, { params }: Context) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  let messageJobId: string | null = null;
  try {
    const body = (await request.json()) as {
      templateId?: string;
      variables?: Record<string, string>;
      scope?: "all" | "filtered" | "selected";
      keyword?: string;
      selectedIds?: string[];
      recipientNameVariables?: string[];
    };
    if (!body.templateId || !body.scope) {
      return Response.json(
        { message: "템플릿과 발송 대상을 확인해 주세요." },
        { status: 400 },
      );
    }

    const [{ data: book }, { data: template }] = await Promise.all([
      supabase
        .from("address_books")
        .select("id,workspace_id,contact_count")
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

    const provider = getMessageProvider();
    provider.validateCustomSendType(template.send_type);

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
    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
    if (body.scope === "selected" && selectedIds.length === 0) {
      return Response.json(
        { message: "선택한 발송 대상이 없습니다." },
        { status: 400 },
      );
    }
    if (body.scope === "selected" && selectedIds.length === 1) {
      const { data: selectedContact } = await supabase
        .from("address_book_contacts")
        .select("normalized_phone")
        .eq("address_book_id", bookId)
        .eq("id", selectedIds[0])
        .maybeSingle();
      if (selectedContact) {
        const phoneError = getPhoneSendError(selectedContact.normalized_phone);
        if (phoneError) {
          return Response.json({ message: phoneError }, { status: 400 });
        }
      }
    }

    const admin = createAdminClient();
    messageJobId = randomUUID();
    const requestedCount =
      body.scope === "all"
        ? book.contact_count
        : body.scope === "selected"
          ? selectedIds.length
          : 0;
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
        target_scope: body.scope,
        requested_by: user.id,
        requested_count: requestedCount,
        status: "processing",
      });
    if (jobError) throw new Error(`발송 작업 저장 실패: ${jobError.code}`);

    await start(sendAddressBookMessagesWorkflow, [
      {
        messageJobId,
        bookId,
        provider: provider.name,
        templateCode: template.template_code,
        sendType: template.send_type,
        recipientNameVariables,
        inputVariables,
        scope: body.scope,
        keyword: body.keyword ?? "",
        selectedIds,
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
        .from("address_book_message_jobs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", messageJobId);
    }
    return Response.json(
      { message: error instanceof Error ? error.message : "메시지 발송 실패" },
      { status: 400 },
    );
  }
}
