import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShoongChannelFields,
  isShoongTextSendType,
  normalizeShoongSendType,
} from "./shoong-send-type";

test("저장된 Shoong 발송 타입을 API 요청 형식으로 정규화한다", () => {
  assert.equal(normalizeShoongSendType("lms"), "lms");
  assert.equal(normalizeShoongSendType(" SMS "), "sms");
  assert.equal(normalizeShoongSendType("AT"), "at");
  assert.equal(normalizeShoongSendType("ai"), "ai");
});

test("문자와 알림톡 요청에 서로 다른 Shoong 채널 필드를 만든다", () => {
  assert.equal(isShoongTextSendType("sms"), true);
  assert.equal(isShoongTextSendType("lms"), true);
  assert.deepEqual(
    buildShoongChannelFields("sms", "text_template", "070-0000-0000"),
    {
      sendType: "sms",
      callbackNumber: "07000000000",
      "channelConfig.templateCode": "text_template",
    },
  );
  assert.deepEqual(buildShoongChannelFields("ai", "alimtalk_template"), {
    sendType: "ai",
    "channelConfig.templatecode": "alimtalk_template",
  });
  assert.deepEqual(buildShoongChannelFields("at", "text_alimtalk_template"), {
    sendType: "at",
    "channelConfig.templatecode": "text_alimtalk_template",
  });
  assert.throws(
    () => buildShoongChannelFields("sms", "text_template"),
    /SHOONG_CALLBACK_NUMBER/,
  );
});
