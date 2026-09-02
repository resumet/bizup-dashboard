import "server-only";

import { directalkMessageProvider } from "./directalk-provider";
import { shoongMessageProvider } from "./shoong-provider";
import type { MessageProvider, MessageProviderName } from "./types";

const PROVIDERS: Record<MessageProviderName, MessageProvider> = {
  shoong: shoongMessageProvider,
  directalk: directalkMessageProvider,
};

export function getConfiguredMessageProviderName(): MessageProviderName {
  const configured = (process.env.MESSAGE_PROVIDER || "shoong")
    .trim()
    .toLowerCase();
  if (configured !== "shoong" && configured !== "directalk") {
    throw new Error(`지원하지 않는 메시지 공급자입니다: ${configured}`);
  }
  return configured;
}

export function getMessageProvider(name?: MessageProviderName) {
  return PROVIDERS[name ?? getConfiguredMessageProviderName()];
}

export type {
  FixedMessageTemplate,
  FixedMessageVariables,
  MessageBatchDeliveryResult,
  MessageDeliveryResult,
  MessageProvider,
  MessageProviderName,
  MessageRecipientDeliveryResult,
  MessageSendResult,
  SendCustomMessagesInput,
  SendCustomMessageInput,
  SendFixedMessagesInput,
  SendFixedMessageInput,
} from "./types";
