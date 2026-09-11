import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDirectalkVariables,
  stripDirectalkButtonLinkScheme,
} from "./directalk-values";

test("DirecTalk 버튼 링크에서는 https 스킴만 제거한다", () => {
  assert.equal(
    stripDirectalkButtonLinkScheme("https://open.kakao.com/o/gagOTCKi"),
    "open.kakao.com/o/gagOTCKi",
  );
  assert.equal(
    stripDirectalkButtonLinkScheme("OPEN.KAKAO.COM/o/gagOTCKi"),
    "OPEN.KAKAO.COM/o/gagOTCKi",
  );
});

test("DirecTalk의 링크·링크명 변수만 버튼 링크 형식으로 정규화한다", () => {
  assert.deepEqual(
    normalizeDirectalkVariables({
      링크명: "https://open.kakao.com/o/room",
      링크: "https://example.com/path",
      입장링크: "https://example.com/entry",
      강좌명: "https://로 시작하는 강좌명",
    }),
    {
      링크명: "open.kakao.com/o/room",
      링크: "example.com/path",
      입장링크: "example.com/entry",
      강좌명: "https://로 시작하는 강좌명",
    },
  );
});

test("추가된 링크 입력 변수의 URL은 본문에서도 사용할 수 있도록 원문을 유지한다", () => {
  const variables = {
    결제링크: "https://example.com/pay",
    접속주소: "https://example.com/join",
    course_url: "https://example.com/course",
    paymentLink: "https://example.com/payment",
  };
  assert.deepEqual(normalizeDirectalkVariables(variables), variables);
});
