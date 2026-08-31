import assert from "node:assert/strict";
import test from "node:test";

import { getFixedShoongTemplateContract } from "./fixed-shoong-templates";

test("유료강의 결제자 초대 샘플의 Shoong 계약을 명시적으로 저장한다", () => {
  assert.deepEqual(getFixedShoongTemplateContract("paid_invite"), {
    templateCode: "inivite_paid_kakao_talk",
    sendType: "at",
    variableNames: ["고객명", "강좌명", "입장코드", "링크명"],
  });
});
