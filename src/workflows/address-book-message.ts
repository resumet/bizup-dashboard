import { createHash } from "node:crypto";

import { loadAllAddressBookContacts } from "@/lib/address-books/load";
import {
  chunkMessageRecipients,
  resolveMessageJobStatus,
} from "@/lib/messages/dispatch";
import { buildRecipientTemplateVariables } from "@/lib/messages/custom-template";
import { getPhoneSendError } from "@/lib/messages/phone";
import { sendShoongCustomMessage } from "@/lib/shoong/client";
import { createAdminClient } from "@/lib/supabase/admin";

export type AddressBookMessageWorkflowInput = {
  messageJobId: string;
  bookId: string;
  templateCode: string;
  sendType: string;
  recipientNameVariables: string[];
  inputVariables: Record<string, string>;
  scope: "all" | "filtered" | "selected";
  keyword: string;
  selectedIds: string[];
};

type PreparedRecipient = {
  id: string;
  contactId: string;
  name: string;
  phone: string;
};

function deterministicRecipientId(messageJobId: string, contactId: string) {
  const hex = createHash("sha256")
    .update(`${messageJobId}:${contactId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function prepareAddressBookRecipients(
  input: AddressBookMessageWorkflowInput,
) {
  "use step";
  console.info("[address-message] preparing recipients", {
    messageJobId: input.messageJobId,
    scope: input.scope,
  });

  const admin = createAdminClient();
  const allContacts = await loadAllAddressBookContacts(admin, input.bookId);
  const keyword = input.keyword.trim().toLocaleLowerCase("ko-KR");
  const selected = new Set(input.selectedIds);
  const contacts = allContacts.filter((contact) =>
    input.scope === "selected"
      ? selected.has(contact.id)
      : input.scope === "filtered"
        ? !keyword ||
          [contact.name, contact.email, contact.normalized_phone].some(
            (value) =>
              String(value ?? "")
                .toLocaleLowerCase("ko-KR")
                .includes(keyword),
          )
        : true,
  );

  if (contacts.length === 0) throw new Error("발송 대상이 없습니다.");

  const recipients: PreparedRecipient[] = contacts.map((contact) => ({
    id: deterministicRecipientId(input.messageJobId, contact.id),
    contactId: contact.id,
    name: contact.name ?? "",
    phone: contact.normalized_phone,
  }));

  for (let start = 0; start < recipients.length; start += 500) {
    const batch = recipients.slice(start, start + 500);
    const { error } = await admin
      .from("address_book_message_recipients")
      .upsert(
        batch.map((recipient) => ({
          id: recipient.id,
          message_job_id: input.messageJobId,
          contact_id: recipient.contactId,
          recipient_name: recipient.name || null,
          normalized_phone: recipient.phone,
        })),
        { onConflict: "id" },
      );
    if (error) throw new Error(`수신자 저장 실패: ${error.code}`);
  }

  const { error: updateError } = await admin
    .from("address_book_message_jobs")
    .update({ requested_count: recipients.length })
    .eq("id", input.messageJobId);
  if (updateError) throw new Error(`발송 작업 갱신 실패: ${updateError.code}`);

  console.info("[address-message] recipients ready", {
    messageJobId: input.messageJobId,
    count: recipients.length,
  });
  return recipients;
}

async function dispatchAddressBookBatch(
  input: AddressBookMessageWorkflowInput,
  recipients: PreparedRecipient[],
  successBefore: number,
  failedBefore: number,
) {
  "use step";
  console.info("[address-message] dispatching batch", {
    messageJobId: input.messageJobId,
    count: recipients.length,
  });

  const admin = createAdminClient();
  const recipientIds = recipients.map((recipient) => recipient.id);
  const { data: pending, error: pendingError } = await admin
    .from("address_book_message_recipients")
    .select("id")
    .in("id", recipientIds)
    .eq("status", "pending");
  if (pendingError)
    throw new Error(`발송 대상 확인 실패: ${pendingError.code}`);
  const pendingIds = new Set((pending ?? []).map((recipient) => recipient.id));
  const targets = recipients.filter((recipient) =>
    pendingIds.has(recipient.id),
  );

  if (targets.length > 0) {
    const requestedAt = new Date().toISOString();
    const { error: lockError } = await admin
      .from("address_book_message_recipients")
      .update({ status: "unknown", requested_at: requestedAt })
      .in(
        "id",
        targets.map((target) => target.id),
      )
      .eq("status", "pending");
    if (lockError) throw new Error(`발송 대상 잠금 실패: ${lockError.code}`);
  }

  const results = await Promise.all(
    targets.map(async (recipient) => {
      let result;
      const phoneError = getPhoneSendError(recipient.phone);
      if (phoneError) {
        result = {
          ok: false,
          status: null,
          unknown: false,
          reason: phoneError,
        };
      } else {
        try {
          result = await sendShoongCustomMessage(
            recipient.phone,
            input.templateCode,
            input.sendType,
            buildRecipientTemplateVariables(
              input.inputVariables,
              input.recipientNameVariables,
              recipient.name,
            ),
          );
        } catch (error) {
          result = {
            ok: false,
            status: null,
            reason: error instanceof Error ? error.message : "Shoong 발송 오류",
          };
        }
      }

      const { error: resultError } = await admin
        .from("address_book_message_recipients")
        .update({
          status: result.ok ? "success" : result.unknown ? "unknown" : "failed",
          http_status: result.status,
          shoong_code: result.code ?? null,
          group_id: result.groupId ?? null,
          message_id: result.messageId ?? null,
          failure_reason: result.reason ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", recipient.id);
      if (resultError) {
        console.error("[address-message] recipient result update failed", {
          recipientId: recipient.id,
          code: resultError.code,
        });
      }
      return result;
    }),
  );

  const successCount =
    successBefore + results.filter((result) => result.ok).length;
  const failedCount =
    failedBefore + results.filter((result) => !result.ok).length;
  await admin
    .from("address_book_message_jobs")
    .update({ success_count: successCount, failed_count: failedCount })
    .eq("id", input.messageJobId);
  return { successCount, failedCount };
}
dispatchAddressBookBatch.maxRetries = 0;

async function finishAddressBookJob(
  messageJobId: string,
  successCount: number,
  failedCount: number,
) {
  "use step";
  const admin = createAdminClient();
  const { error } = await admin
    .from("address_book_message_jobs")
    .update({
      status: resolveMessageJobStatus(successCount, failedCount),
      success_count: successCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
    })
    .eq("id", messageJobId);
  if (error) throw new Error(`발송 작업 완료 저장 실패: ${error.code}`);
}

async function failAddressBookJob(messageJobId: string, reason: string) {
  "use step";
  console.error("[address-message] workflow failed", { messageJobId, reason });
  const admin = createAdminClient();
  await admin
    .from("address_book_message_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", messageJobId);
}

export async function sendAddressBookMessagesWorkflow(
  input: AddressBookMessageWorkflowInput,
) {
  "use workflow";
  console.info("[address-message] workflow started", {
    messageJobId: input.messageJobId,
  });

  try {
    const recipients = await prepareAddressBookRecipients(input);
    let successCount = 0;
    let failedCount = 0;
    for (const batch of chunkMessageRecipients(recipients)) {
      const progress = await dispatchAddressBookBatch(
        input,
        batch,
        successCount,
        failedCount,
      );
      successCount = progress.successCount;
      failedCount = progress.failedCount;
    }
    await finishAddressBookJob(input.messageJobId, successCount, failedCount);
    console.info("[address-message] workflow completed", {
      messageJobId: input.messageJobId,
      successCount,
      failedCount,
    });
    return { successCount, failedCount };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "발송 워크플로 오류";
    await failAddressBookJob(input.messageJobId, reason);
    throw new Error(reason);
  }
}
