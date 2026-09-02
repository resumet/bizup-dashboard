import type { FixedShoongTemplate } from "@/lib/messages/fixed-shoong-templates";

export type MessageProviderName = "shoong" | "directalk";
export type FixedMessageTemplate = FixedShoongTemplate;

export type FixedMessageVariables = {
  customerName: string;
  courseName: string;
  entryCode?: string;
  linkName?: string;
};

export type MessageSendResult = {
  provider: MessageProviderName;
  ok: boolean;
  status: number | null;
  code?: string;
  groupId?: string;
  messageId?: string;
  correlationId?: string;
  providerStatus?: string;
  deliveryPending?: boolean;
  reason?: string;
  unknown?: boolean;
};

export type MessageDeliveryResult = {
  provider: MessageProviderName;
  state: "processing" | "success" | "failed" | "unknown";
  terminal: boolean;
  providerStatus?: string;
  code?: string;
  reason?: string;
  finalMessageType?: string;
  correlationId?: string;
};

export type MessageRecipientDeliveryResult = MessageDeliveryResult & {
  seq: number;
};

export type MessageBatchDeliveryResult = MessageDeliveryResult & {
  recipients: MessageRecipientDeliveryResult[];
};

export type SendFixedMessageInput = {
  phone: string;
  template: FixedMessageTemplate;
  variables: FixedMessageVariables;
  idempotencyKey: string;
};

export type SendCustomMessageInput = {
  phone: string;
  templateCode: string;
  sendType: string;
  variables: Record<string, string>;
  idempotencyKey: string;
};

export type FixedMessageBatchRecipient = Pick<
  SendFixedMessageInput,
  "phone" | "variables"
>;

export type CustomMessageBatchRecipient = Pick<
  SendCustomMessageInput,
  "phone" | "variables"
>;

export type SendFixedMessagesInput = {
  recipients: FixedMessageBatchRecipient[];
  template: FixedMessageTemplate;
  idempotencyKey: string;
};

export type SendCustomMessagesInput = {
  recipients: CustomMessageBatchRecipient[];
  templateCode: string;
  sendType: string;
  idempotencyKey: string;
};

export interface MessageProvider {
  readonly name: MessageProviderName;
  getFixedTemplateCode(template: FixedMessageTemplate): string;
  validateCustomSendType(sendType: string): void;
  sendFixedMessage(input: SendFixedMessageInput): Promise<MessageSendResult>;
  sendCustomMessage(input: SendCustomMessageInput): Promise<MessageSendResult>;
  sendFixedMessages?(
    input: SendFixedMessagesInput,
  ): Promise<MessageSendResult>;
  sendCustomMessages?(
    input: SendCustomMessagesInput,
  ): Promise<MessageSendResult>;
  getDeliveryResult?(
    groupId: string,
  ): Promise<MessageDeliveryResult>;
  getBatchDeliveryResult?(
    groupId: string,
  ): Promise<MessageBatchDeliveryResult>;
}
