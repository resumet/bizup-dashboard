export function normalizeShoongSendType(value: string) {
  return value.trim().toLowerCase();
}

export function isShoongTextSendType(value: string) {
  return ["sms", "lms"].includes(normalizeShoongSendType(value));
}

export function buildShoongChannelFields(
  sendType: string,
  templateCode: string,
  callbackNumber?: string,
): Record<string, string> {
  const normalizedSendType = normalizeShoongSendType(sendType);
  if (!normalizedSendType) throw new Error("템플릿 sendType이 누락되었습니다.");

  if (isShoongTextSendType(normalizedSendType)) {
    const normalizedCallbackNumber = String(callbackNumber ?? "").replace(
      /\D/gu,
      "",
    );
    if (!normalizedCallbackNumber) {
      throw new Error(
        "문자 발송용 SHOONG_CALLBACK_NUMBER 환경변수가 누락되었습니다.",
      );
    }
    return {
      sendType: normalizedSendType,
      callbackNumber: normalizedCallbackNumber,
      "channelConfig.templateCode": templateCode,
    };
  }

  return {
    sendType: normalizedSendType,
    "channelConfig.templatecode": templateCode,
  };
}
