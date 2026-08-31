import "server-only";

import {
  getFixedShoongTemplateContract,
  type FixedShoongTemplate,
} from "@/lib/messages/fixed-shoong-templates";
import { getPhoneSendError } from "@/lib/messages/phone";
import { buildShoongChannelFields } from "@/lib/messages/shoong-send-type";

export type ShoongTemplate = FixedShoongTemplate;
type ShoongVariables = {
  customerName: string;
  courseName: string;
  entryCode?: string;
  linkName?: string;
};
export type ShoongSendResult = {
  ok: boolean;
  status: number | null;
  code?: string;
  groupId?: string;
  messageId?: string;
  reason?: string;
  unknown?: boolean;
};

function getConfig(template: ShoongTemplate) {
  const contract = getFixedShoongTemplateContract(template);
  const apiKey = process.env.SHOONG_API_KEY;
  const senderKey = process.env.SHOONG_SENDER_KEY;
  const sendType =
    (template === "paid_confirm"
      ? process.env.SHOONG_SEND_TYPE_PAID_CONFIRM
      : process.env.SHOONG_SEND_TYPE_PAID_INVITE) || contract.sendType;
  const templateCode =
    template === "paid_confirm"
      ? process.env.SHOONG_TEMPLATE_PAID_CONFIRM || contract.templateCode
      : process.env.SHOONG_TEMPLATE_PAID_INVITE || contract.templateCode;
  const missing = [
    !apiKey && "SHOONG_API_KEY",
    !senderKey && "SHOONG_SENDER_KEY",
  ].filter(Boolean);
  if (missing.length > 0)
    throw new Error(`Shoong 환경변수가 누락되었습니다: ${missing.join(", ")}`);
  return {
    apiKey: apiKey!,
    senderKey: senderKey!,
    sendType: sendType!,
    templateCode: templateCode!,
    endpoint: process.env.SHOONG_API_BASE_URL || "https://api.shoong.kr/send",
  };
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

export async function sendShoongMessage(
  phone: string,
  template: ShoongTemplate,
  variables: ShoongVariables,
): Promise<ShoongSendResult> {
  const phoneError = getPhoneSendError(phone);
  if (phoneError) return { ok: false, status: null, reason: phoneError };
  const config = getConfig(template);
  const payload: Record<string, string> = {
    phone,
    "channelConfig.senderkey": config.senderKey,
    ...buildShoongChannelFields(
      config.sendType,
      config.templateCode,
      process.env.SHOONG_CALLBACK_NUMBER,
    ),
    "variables.고객명": variables.customerName,
    "variables.강좌명": variables.courseName,
  };
  if (template === "paid_invite") {
    payload["variables.입장코드"] = variables.entryCode ?? "";
    payload["variables.링크명"] = variables.linkName ?? "";
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const result = (
        typeof body.data === "object" && body.data ? body.data : body
      ) as Record<string, unknown>;
      if (response.ok)
        return {
          ok: true,
          status: response.status,
          code: textValue(result.code),
          groupId: textValue(result.groupId ?? result.group_id),
          messageId: textValue(result.messageId ?? result.message_id),
        };
      if (response.status < 500 || attempt === 2)
        return {
          ok: false,
          status: response.status,
          code: textValue(result.code),
          reason: textValue(result.message) ?? `Shoong HTTP ${response.status}`,
        };
    } catch (error) {
      if (attempt === 2)
        return {
          ok: false,
          status: null,
          unknown: true,
          reason: error instanceof Error ? error.name : "네트워크 오류",
        };
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  return {
    ok: false,
    status: null,
    unknown: true,
    reason: "결과를 확인할 수 없습니다.",
  };
}

export function getShoongTemplateCode(template: ShoongTemplate) {
  return getConfig(template).templateCode;
}

export async function sendShoongCustomMessage(
  phone: string,
  templateCode: string,
  sendType: string,
  variables: Record<string, string>,
): Promise<ShoongSendResult> {
  const phoneError = getPhoneSendError(phone);
  if (phoneError) return { ok: false, status: null, reason: phoneError };
  const apiKey = process.env.SHOONG_API_KEY;
  const senderKey = process.env.SHOONG_SENDER_KEY;
  if (!apiKey || !senderKey)
    throw new Error("Shoong API 키 또는 sender key가 누락되었습니다.");
  const payload: Record<string, string> = {
    phone,
    "channelConfig.senderkey": senderKey,
    ...buildShoongChannelFields(
      sendType,
      templateCode,
      process.env.SHOONG_CALLBACK_NUMBER,
    ),
  };
  Object.entries(variables).forEach(([key, value]) => {
    payload[`variables.${key}`] = value;
  });
  const endpoint =
    process.env.SHOONG_API_BASE_URL || "https://api.shoong.kr/send";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const result = (
        typeof body.data === "object" && body.data ? body.data : body
      ) as Record<string, unknown>;
      if (response.ok)
        return {
          ok: true,
          status: response.status,
          code: textValue(result.code),
          groupId: textValue(result.groupId ?? result.group_id),
          messageId: textValue(result.messageId ?? result.message_id),
        };
      if (response.status < 500 || attempt === 2)
        return {
          ok: false,
          status: response.status,
          code: textValue(result.code),
          reason: textValue(result.message) ?? `Shoong HTTP ${response.status}`,
        };
    } catch (error) {
      if (attempt === 2)
        return {
          ok: false,
          status: null,
          unknown: true,
          reason: error instanceof Error ? error.name : "네트워크 오류",
        };
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  return {
    ok: false,
    status: null,
    unknown: true,
    reason: "결과를 확인할 수 없습니다.",
  };
}
