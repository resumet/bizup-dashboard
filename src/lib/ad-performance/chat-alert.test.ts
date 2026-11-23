import assert from "node:assert/strict";
import test from "node:test";
import { chatAudienceAlert } from "./chat-alert";
test("톡방 비율 80% 경계, 미입력, 0명과 광고 DB 없음은 구분한다", () => {
  assert.match(chatAudienceAlert(100, 80)!, /80%/);
  assert.match(chatAudienceAlert(100, 0)!, /0%/);
  assert.equal(chatAudienceAlert(100, 81), null);
  assert.equal(chatAudienceAlert(100, null), null);
  assert.equal(chatAudienceAlert(0, 0), null);
  assert.equal(chatAudienceAlert(1000, 801), null);
});
