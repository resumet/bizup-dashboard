import assert from "node:assert/strict";
import test from "node:test";

import { buildGmailComposeWithAccountChooser } from "./gmail";

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
});

function assertNotNull(value: string | null): string {
  assert.notEqual(value, null);
  return value as string;
}
