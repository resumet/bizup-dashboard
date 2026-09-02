import "server-only";

import { getFixedShoongTemplateContract } from "@/lib/messages/fixed-shoong-templates";
import { normalizeShoongSendType } from "@/lib/messages/shoong-send-type";

import {
  getDirectalkBatchDeliveryResult,
  getDirectalkDeliveryResult,
  sendDirectalkAlimtalk,
  sendDirectalkAlimtalkBatch,
} from "./directalk-client";
import { normalizeDirectalkVariables } from "./directalk-values";
import type {
  FixedMessageTemplate,
  MessageProvider,
} from "./types";

const TEMPLATE_ENV_KEYS: Record<FixedMessageTemplate, string> = {
  paid_confirm: "DIRECTALK_TEMPLATE_PAID_CONFIRM",
  paid_invite: "DIRECTALK_TEMPLATE_PAID_INVITE",
};

function getDirectalkTemplateCode(template: FixedMessageTemplate) {
  const configured = process.env[TEMPLATE_ENV_KEYS[template]]?.trim();
  return configured || getFixedShoongTemplateContract(template).templateCode;
}

function getUnsupportedSendTypeReason(sendType: string) {
  const normalized = normalizeShoongSendType(sendType);
  if (["at", "ai"].includes(normalized)) return null;

  return ["sms", "lms"].includes(normalized)
    ? "DirecTalk 독립 SMS/LMS 발송 API는 아직 지원되지 않습니다."
    : `DirecTalk에서 지원하지 않는 발송 유형입니다: ${sendType}`;
}

function validateDirectalkCustomSendType(sendType: string) {
  const reason = getUnsupportedSendTypeReason(sendType);
  if (reason) throw new Error(reason);
}

function fixedRecipientVariables(
  template: FixedMessageTemplate,
  variables: {
    customerName: string;
    courseName: string;
    entryCode?: string;
    linkName?: string;
  },
) {
  const recipientVariables: Record<string, string> = {
    고객명: variables.customerName,
    강좌명: variables.courseName,
  };
  if (template === "paid_invite") {
    recipientVariables.입장코드 = variables.entryCode ?? "";
    recipientVariables.링크명 = variables.linkName ?? "";
  }
  return normalizeDirectalkVariables(recipientVariables);
}

export const directalkMessageProvider: MessageProvider = {
  name: "directalk",
  getFixedTemplateCode: getDirectalkTemplateCode,
  validateCustomSendType: validateDirectalkCustomSendType,
  sendFixedMessage({
    phone,
    template,
    variables,
    idempotencyKey,
  }) {
    return sendDirectalkAlimtalk({
      phone,
      templateCode: getDirectalkTemplateCode(template),
      variables: fixedRecipientVariables(template, variables),
      idempotencyKey,
    });
  },
  sendFixedMessages({ recipients, template, idempotencyKey }) {
    return sendDirectalkAlimtalkBatch({
      recipients: recipients.map((recipient) => ({
        phone: recipient.phone,
        variables: fixedRecipientVariables(template, recipient.variables),
      })),
      templateCode: getDirectalkTemplateCode(template),
      idempotencyKey,
    });
  },
  sendCustomMessage({
    phone,
    templateCode,
    sendType,
    variables,
    idempotencyKey,
  }) {
    validateDirectalkCustomSendType(sendType);

    return sendDirectalkAlimtalk({
      phone,
      templateCode,
      variables: normalizeDirectalkVariables(variables),
      idempotencyKey,
    });
  },
  sendCustomMessages({
    recipients,
    templateCode,
    sendType,
    idempotencyKey,
  }) {
    validateDirectalkCustomSendType(sendType);
    return sendDirectalkAlimtalkBatch({
      recipients: recipients.map((recipient) => ({
        phone: recipient.phone,
        variables: normalizeDirectalkVariables(recipient.variables),
      })),
      templateCode,
      idempotencyKey,
    });
  },
  getDeliveryResult: getDirectalkDeliveryResult,
  getBatchDeliveryResult: getDirectalkBatchDeliveryResult,
};
