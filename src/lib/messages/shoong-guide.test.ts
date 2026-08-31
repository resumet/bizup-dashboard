import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTemplateSelectionLabel,
  getTemplateSendTypeLabel,
  parseShoongIntegrationGuide,
} from "./shoong-guide";

test("붙여넣은 Shoong API 연동 가이드에서 템플릿 정보를 추출한다", () => {
  const parsed = parseShoongIntegrationGuide(`
API 연동 가이드
전용 입장 링크 안내

Authorization: Bearer SECRET_KEY_MUST_NOT_BE_STORED
curl -X POST 'https://api.shoong.kr/send' \\
-d '{"sendType":"at","channelConfig.templatecode":"dedicated_entry_link_guide","variables.신청자":"","variables.강좌명":""}'
  `);

  assert.deepEqual(parsed, {
    name: "전용 입장 링크 안내",
    templateCode: "dedicated_entry_link_guide",
    sendType: "at",
    variableNames: ["신청자", "강좌명"],
    applicantVariable: "신청자",
    courseVariable: "강좌명",
  });
  assert.equal(JSON.stringify(parsed).includes("SECRET_KEY"), false);
});

test("sendType을 저장 형식으로 읽고 템플릿 카드 표시명을 만든다", () => {
  const parsed = parseShoongIntegrationGuide(`
API 연동 가이드
장문 문자 안내
{"sendType":"LMS","channelConfig.templatecode":"lms_guide","variables.이름":""}
  `);

  assert.equal(parsed.sendType, "lms");
  assert.equal(getTemplateSendTypeLabel(parsed.sendType), "문자 LMS");
  assert.equal(getTemplateSendTypeLabel("sms"), "문자 SMS");
  assert.equal(getTemplateSendTypeLabel("ai"), "알림톡");
  assert.equal(getTemplateSendTypeLabel("at"), "알림톡");
  assert.equal(
    formatTemplateSelectionLabel("at", "유료강의 초대"),
    "[알림톡] 유료강의 초대",
  );
  assert.equal(
    formatTemplateSelectionLabel("LMS", "긴급 공지"),
    "[문자 LMS] 긴급 공지",
  );
});

test("중첩 variables 형식과 여러 템플릿 변수를 읽는다", () => {
  const parsed = parseShoongIntegrationGuide(`
API 연동 가이드
결제 안내
{"sendType":"ai","channelConfig":{"templatecode":"payment_guide"},"variables":{"고객명":"","상품명":"","결제링크":""}}
  `);
  assert.deepEqual(parsed.variableNames, ["고객명", "상품명", "결제링크"]);
  assert.equal(parsed.applicantVariable, "고객명");
});

test("템플릿 코드나 변수가 없는 가이드는 저장하지 않는다", () => {
  assert.throws(
    () => parseShoongIntegrationGuide("API 연동 가이드"),
    /templatecode/,
  );
  assert.throws(
    () =>
      parseShoongIntegrationGuide(
        '{"channelConfig.templatecode":"missing_variables"}',
      ),
    /sendType/,
  );
  assert.throws(
    () =>
      parseShoongIntegrationGuide(
        '{"channelConfig.templatecode":"missing_send_type","variables.이름":""}',
      ),
    /sendType/,
  );
  assert.throws(
    () =>
      parseShoongIntegrationGuide(
        '{"sendType":"at","channelConfig.templatecode":"missing_variables"}',
      ),
    /variables/,
  );
});
