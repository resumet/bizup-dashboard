import "server-only";

import {
  getShoongTemplateCode,
  sendShoongCustomMessage,
  sendShoongMessage,
} from "@/lib/shoong/client";

import type { MessageProvider } from "./types";

export const shoongMessageProvider: MessageProvider = {
  name: "shoong",
  getFixedTemplateCode: getShoongTemplateCode,
  validateCustomSendType() {},
  async sendFixedMessage({ phone, template, variables }) {
    const result = await sendShoongMessage(phone, template, variables);
    return { provider: "shoong", ...result };
  },
  async sendCustomMessage({ phone, templateCode, sendType, variables }) {
    const result = await sendShoongCustomMessage(
      phone,
      templateCode,
      sendType,
      variables,
    );
    return { provider: "shoong", ...result };
  },
};
