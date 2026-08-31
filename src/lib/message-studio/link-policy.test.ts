import assert from "node:assert/strict";
import test from "node:test";

import type { MessageStudioDraft } from "./types";
import {
  buildMessage30LinkBlock,
  enforceMessageLinkPolicy,
  validateMessageLinks,
} from "./link-policy";

const project: MessageStudioDraft = {
  course_name: "AI 강의",
  instructor_name: "홍길동",
  course_features: "자동화",
  target_audience: "사업자",
  payment_link: "https://example.com/payment",
  inquiry_link: "https://example.com/inquiry",
  curriculum_link: "https://example.com/curriculum",
  replay_link: "https://example.com/replay",
};

test("1~29번 문자는 기존 URL을 제거하고 결제 링크만 한 번 사용한다", () => {
  const message = enforceMessageLinkPolicy(
    12,
    "본문\nhttps://old.example/a\n문의 https://old.example/b",
    project,
  );
  assert.equal(message, "본문\n\n문의\n\nhttps://example.com/payment");
  assert.equal(message.match(/https:\/\//gu)?.length, 1);
});

test("30번 문자는 지정된 문구와 4개 링크 블록을 그대로 사용한다", () => {
  const message = enforceMessageLinkPolicy(
    30,
    "마감 안내 본문\n\n✅ 수강 신청 링크 ✅\nhttps://old.example",
    project,
  );
  assert.equal(
    message,
    `마감 안내 본문\n\n${buildMessage30LinkBlock(project)}`,
  );
  assert.match(
    message,
    /✅ 수강 신청 링크 ✅\nhttps:\/\/example\.com\/payment\n\n👉 결제 및 수강 문의하기\nhttps:\/\/example\.com\/inquiry\n\n💘 커리큘럼 보기\nhttps:\/\/example\.com\/curriculum\n\n💌 무료강의 수강 선물 받기\nhttps:\/\/example\.com\/replay$/u,
  );
});

test("30번 생성에는 네 종류 링크가 모두 필요하다", () => {
  assert.deepEqual(
    validateMessageLinks(
      [30],
      { ...project, inquiry_link: "", curriculum_link: "", replay_link: "" },
    ),
    [
      "문의 링크를 입력해 주세요.",
      "커리큘럼 링크를 입력해 주세요.",
      "다시보기 링크를 입력해 주세요.",
    ],
  );
});
