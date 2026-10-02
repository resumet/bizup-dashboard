import assert from "node:assert/strict";
import test from "node:test";

import { buildGmailComposeWithAccountChooser, buildGmailCourseHeader, buildGmailMessage } from "./gmail";

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

test("선택한 강의 정보와 저장한 제목을 Gmail 작성 내용에 반영한다", () => {
  const course = {
    webinarAt: "2026-10-15T19:30:00+09:00",
    courseName: "브랜드 마케팅 실전",
    instructorName: "김강사",
    channelName: "성장하는 채널",
  };
  const header = [
    "강의 날짜: 2026년 10월 15일 목요일 오후 7:30",
    "강의명: 브랜드 마케팅 실전",
    "강사 이름: 김강사",
    "유튜브 채널: 성장하는 채널",
  ].join("\n");
  assert.equal(buildGmailCourseHeader(course), header);

  const accountChooserUrl = new URL(
    buildGmailComposeWithAccountChooser("creator@example.com", {
      subject: "유튜브 출연 제안드립니다",
      body: "안녕하세요.",
      course,
    }),
  );
  const composeUrl = new URL(
    assertNotNull(accountChooserUrl.searchParams.get("continue")),
  );
  assert.equal(composeUrl.searchParams.get("su"), "유튜브 출연 제안드립니다");
  assert.equal(composeUrl.searchParams.get("body"), `${header}\n\n안녕하세요.`);
});

function assertNotNull(value: string | null): string {
  assert.notEqual(value, null);
  return value as string;
}
