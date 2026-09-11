import { canMapVariableToRecipientName } from "@/lib/messages/automation-config";
import { buildRecipientTemplateVariables, getTemplateVariables, parseTemplateVariableValues } from "@/lib/messages/custom-template";
import { dedupeMessageRecipientsByPhone } from "@/lib/messages/dispatch";
import { getPhoneSendError } from "@/lib/messages/phone";
import { renderMessagePreview } from "@/lib/messages/preview";
import { getConfiguredMessageProviderName } from "@/lib/messages/provider";
import { normalizeDirectalkVariables } from "@/lib/messages/provider/directalk-values";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ bookId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = await request.json();
    if (typeof body.templateId !== "string" || (body.contactId !== undefined && typeof body.contactId !== "string")) {
      throw new Error("템플릿과 발송 대상을 확인해 주세요.");
    }
    const [bookResult, templateResult] = await Promise.all([
      supabase.from("address_books").select("id,workspace_id").eq("id", bookId).maybeSingle(),
      supabase.from("message_templates").select("id,applicant_variable,course_variable,variable_names").eq("id", body.templateId).maybeSingle(),
    ]);
    if (bookResult.error || templateResult.error) throw new Error("미리보기 정보를 불러오지 못했습니다.");
    if (!bookResult.data || !templateResult.data) {
      return Response.json({ message: "주소록 또는 템플릿을 찾을 수 없습니다." }, { status: 404 });
    }
    const template = templateResult.data;
    const allVariables = getTemplateVariables(template.applicant_variable, template.variable_names?.length ? template.variable_names : template.course_variable);
    const nameVariables = Array.isArray(body.recipientNameVariables)
      ? body.recipientNameVariables.filter((variable: unknown): variable is string => typeof variable === "string" && allVariables.includes(variable) && canMapVariableToRecipientName(variable))
      : [template.applicant_variable];
    const variables = parseTemplateVariableValues(body.variables, allVariables.filter((variable) => !nameVariables.includes(variable)));
    const { data: savedPreview, error: previewError } = await supabase.from("message_template_previews").select("body").eq("workspace_id", bookResult.data.workspace_id).eq("template_id", template.id).maybeSingle();
    if (previewError) throw new Error("미리보기 본문을 불러오지 못했습니다.");
    const previewBody = savedPreview?.body ?? "";
    const provider = getConfiguredMessageProviderName();

    // Match the workflow's ID order and phone deduplication, stopping at ten recipients.
    let contacts: { id: string; name: string | null; normalized_phone: string }[] = [];
    for (let offset = 0; contacts.length < 10; offset += 10) {
      let query = supabase.from("address_book_contacts").select("id,name,normalized_phone").eq("address_book_id", bookId);
      if (body.contactId !== undefined) query = query.eq("id", body.contactId);
      const { data, error } = await query.order("id").range(offset, offset + 9);
      if (error) throw new Error("미리보기 고객을 불러오지 못했습니다.");
      contacts = dedupeMessageRecipientsByPhone([...contacts, ...(data ?? [])], (contact) => contact.normalized_phone);
      if ((data?.length ?? 0) < 10) break;
    }
    return Response.json({
      hasBody: Boolean(previewBody.trim()),
      recipients: contacts.slice(0, 10).map((contact) => {
        const recipientVariables = buildRecipientTemplateVariables(variables, nameVariables, contact.name ?? "");
        const sendVariables = provider === "directalk" ? normalizeDirectalkVariables(recipientVariables) : recipientVariables;
        return {
        id: contact.id,
        name: contact.name ?? "",
        phone: contact.normalized_phone,
        variables: sendVariables,
        ...renderMessagePreview(previewBody, sendVariables),
        phoneError: getPhoneSendError(contact.normalized_phone),
      }; }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다." }, { status: 400 });
  }
}
