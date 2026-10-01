import assert from "node:assert/strict";
import test from "node:test";

import { buildGmailComposeWithAccountChooser, buildGmailMessage } from "./gmail";

test("Google 계정 선택 후 수신자가 입력된 Gmail 작성창으로 이동한다", () => {
  const accountChooserUrl = new URL(
    buildGmailComposeWithAccountChooser(" Contact+team@example.co.kr "),
  );

  assert.equal(accountChooserUrl.origin, "https://accounts.google.com");
  assert.equal(accountChooserUrl.pathname, "/AccountChooser");
  assert.equal(accountChooserUrl.searchParams.get("service"), "mail");

  const composeUrl = new URL(
    assertNotNull(accountChooserUrl.searchParams.get("continue")),
  );
  assert.equal(composeUrl.origin, "https://mail.google.com");
  assert.equal(composeUrl.pathname, "/mail/");
  assert.equal(composeUrl.searchParams.get("view"), "cm");
  assert.equal(composeUrl.searchParams.get("fs"), "1");
  assert.equal(composeUrl.searchParams.get("tf"), "1");
  assert.equal(composeUrl.searchParams.get("to"), "Contact+team@example.co.kr");
  assert.equal(composeUrl.searchParams.has("body"), false);
});

test("저장한 본문과 직접 입력한 서명을 Gmail 작성창에 함께 전달한다", () => {
  const message = "안녕하세요.\n유튜브 출연을 제안드립니다.";
  const signature = "비즈업 홍길동\n010-0000-0000";
  const accountChooserUrl = new URL(buildGmailComposeWithAccountChooser("creator@example.com", {
    body: message,
    signatureMode: "custom",
    customSignature: signature,
  }));
  const composeUrl = new URL(assertNotNull(accountChooserUrl.searchParams.get("continue")));

  assert.equal(composeUrl.searchParams.get("body"), `${message}\n\n${signature}`);
  assert.equal(buildGmailMessage({body: message, signatureMode: "gmail_default", customSignature: signature}), message);
});

function assertNotNull(value: string | null): string {
  assert.notEqual(value, null);
  return value as string;
}
