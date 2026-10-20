import assert from "node:assert/strict";
import test from "node:test";

import { formatLandingUtmShareContent } from "./share";

test("UTM 공유 링크 앞에 추천 코드를 표시한다", () => {
  assert.equal(
    formatLandingUtmShareContent(
      [
        {
          id: "utm-1",
          channel: "제휴",
          referral_code: "두시간부업만일로와",
          medium: "인스타그램",
          url: "https://example.com/full",
          short_url: "https://m.site.naver.com/2j1Gz",
        },
      ],
      "김해준 강사",
    ),
    "[김해준강사님 UTM]\n두시간부업만일로와 https://m.site.naver.com/2j1Gz",
  );
});

test("추천 코드가 없으면 기존 공유 제목을 유지한다", () => {
  assert.equal(
    formatLandingUtmShareContent(
      [
        {
          id: "utm-2",
          channel: "오가닉",
          referral_code: "",
          medium: "무료강의 안내방",
          url: "https://example.com/full",
          short_url: "",
        },
      ],
      "",
    ),
    "[강의 UTM]\n오가닉 무료강의 안내방 https://example.com/full",
  );
});
