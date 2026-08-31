import assert from "node:assert/strict";
import test from "node:test";

import { getPhoneSendError, UNSENDABLE_PHONE_MESSAGE } from "./phone";

test("010 휴대전화만 발송 가능하고 비표준 번호는 지정 문구로 거부한다", () => {
  assert.equal(getPhoneSendError("01012345678"), null);
  assert.equal(getPhoneSendError("84563448684"), UNSENDABLE_PHONE_MESSAGE);
  assert.equal(getPhoneSendError("021234567"), UNSENDABLE_PHONE_MESSAGE);
  assert.equal(getPhoneSendError(""), UNSENDABLE_PHONE_MESSAGE);
});

test("단체 대상에서는 비표준 번호만 실패 대상으로 구분한다", () => {
  const results = ["01011112222", "84563448684", "01033334444"].map(
    (phone) => ({ phone, error: getPhoneSendError(phone) }),
  );
  assert.deepEqual(
    results.filter((result) => result.error).map((result) => result.phone),
    ["84563448684"],
  );
  assert.deepEqual(
    results.filter((result) => !result.error).map((result) => result.phone),
    ["01011112222", "01033334444"],
  );
});
