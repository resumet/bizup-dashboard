import assert from "node:assert/strict";
import test from "node:test";

import { parseCourseOperationsInput } from "./validation";

const validInput = {
  name: "AI 수익화 클래스",
  instructorName: "권강사",
  freeWebinarAt: "2026-09-01T19:30:00+09:00",
  startsAt: "2026-09-10T00:00:00+09:00",
  earlyBirdEvent: "8월 31일까지 10만원 할인",
  first50Event: "교재 증정",
  freeKakaoRoom1Link: "https://open.kakao.com/o/free1",
  freeKakaoRoom2Link: "https://open.kakao.com/o/free2",
  communicationRoomLink: "https://open.kakao.com/o/community",
  paymentLink: "https://example.com/payment",
  inquiryLink: "https://example.com/inquiry",
  curriculumLink: "https://example.com/curriculum",
  freeGiftLink: "https://example.com/gift",
  courseViewingLink: "https://example.com/course",
  options: [{
    name: "일반",
    listPrice: "500000",
    salePrice: "390000",
    groupChatLink: "https://open.kakao.com/o/paid",
    entryCode: "1234",
  }],
  youtubeAppearances: [
    {
      channelName: "비즈업 TV",
      channelUrl: "https://youtube.com/@bizup",
      videoUrl: "",
    },
  ],
  rosterJobIds: ["f47ac10b-58cc-4372-a567-0e02b2c3d479"],
  messageProjectIds: [],
  freeAddressBookId: "",
};

test("강의 운영 입력값을 DB 저장 형식으로 변환한다", () => {
  const parsed = parseCourseOperationsInput(validInput);
  assert.equal(parsed.options[0].listPrice, 500000);
  assert.equal(parsed.options[0].salePrice, 390000);
  assert.equal(parsed.options[0].groupChatLink, "https://open.kakao.com/o/paid");
  assert.equal(parsed.options[0].entryCode, "1234");
  assert.equal(parsed.freeWebinarAt, "2026-09-01T10:30:00.000Z");
  assert.equal(parsed.startsAt, "2026-09-09T15:00:00.000Z");
  assert.equal(parsed.freeKakaoRoom1Link, "https://open.kakao.com/o/free1");
  assert.equal(parsed.rosterJobIds.length, 1);
});

test("강의 링크는 비어 있거나 HTTP·HTTPS 주소여야 한다", () => {
  assert.equal(
    parseCourseOperationsInput({ ...validInput, paymentLink: "" }).paymentLink,
    "",
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        courseViewingLink: "javascript:alert(1)",
      }),
    /강의 시청하기 링크.*http 또는 https/u,
  );
});

test("무료 웨비나는 지정 시간만, 개강일은 날짜만 허용한다", () => {
  for (const hour of ["10:30", "19:30", "19:00", "20:00"]) {
    assert.doesNotThrow(() =>
      parseCourseOperationsInput({
        ...validInput,
        freeWebinarAt: `2026-09-01T${hour}:00+09:00`,
      }),
    );
  }
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        freeWebinarAt: "2026-09-01T18:00:00+09:00",
      }),
    /무료 웨비나 시간/u,
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        startsAt: "2026-09-10T10:00:00+09:00",
      }),
    /개강일/u,
  );
});

test("옵션은 하나 이상이며 할인가가 정가보다 높을 수 없다", () => {
  assert.throws(
    () => parseCourseOperationsInput({ ...validInput, options: [] }),
    /하나 이상/,
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        options: [{ name: "일반", listPrice: 100, salePrice: 200 }],
      }),
    /정가보다 높습니다/,
  );
});

test("옵션 단톡방과 입장코드는 선택값이며 입력 시 발송 가능한 형식이어야 한다", () => {
  const emptyInvite = parseCourseOperationsInput({
    ...validInput,
    options: [{
      name: "일반",
      listPrice: 500000,
      salePrice: 390000,
      groupChatLink: "",
      entryCode: "",
    }],
  });
  assert.equal(emptyInvite.options[0].groupChatLink, "");
  assert.equal(emptyInvite.options[0].entryCode, "");

  assert.throws(
    () => parseCourseOperationsInput({
      ...validInput,
      options: [{
        name: "일반",
        listPrice: 500000,
        salePrice: 390000,
        groupChatLink: "http://open.kakao.com/o/paid",
        entryCode: "1234",
      }],
    }),
    /https 주소/u,
  );
  assert.throws(
    () => parseCourseOperationsInput({
      ...validInput,
      options: [{
        name: "일반",
        listPrice: 500000,
        salePrice: 390000,
        groupChatLink: "https://open.kakao.com/o/paid",
        entryCode: "123",
      }],
    }),
    /4~6글자/u,
  );
});

test("유튜브 채널 주소는 웹 URL이어야 한다", () => {
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        youtubeAppearances: [
          { channelName: "채널", channelUrl: "youtube", videoUrl: "" },
        ],
      }),
    /http 또는 https/,
  );
});

test("퍼센트 인코딩된 한글 유튜브 채널 주소를 한글로 저장한다", () => {
  const parsed = parseCourseOperationsInput({
    ...validInput,
    youtubeAppearances: [
      {
        channelName: "두시간부업만",
        channelUrl:
          "https://www.youtube.com/@%EB%91%90%EC%8B%9C%EA%B0%84%EB%B6%80%EC%97%85%EB%A7%8C",
        videoUrl: "",
      },
    ],
  });

  assert.equal(
    parsed.youtubeAppearances[0].channelUrl,
    "https://www.youtube.com/@두시간부업만",
  );
});

test("무료강의 수강생 주소록은 비어 있거나 UUID여야 한다", () => {
  assert.equal(parseCourseOperationsInput(validInput).freeAddressBookId, "");
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        freeAddressBookId: "address-book",
      }),
    /주소록.*형식/,
  );
});

test("수강생 명단은 하나만 연결할 수 있다", () => {
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        rosterJobIds: [
          "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        ],
      }),
    /하나만 연결/,
  );
});

test("필수 작업의 예정일과 완료 여부를 고정된 작업 순서로 저장한다", () => {
  const parsed = parseCourseOperationsInput({
    ...validInput,
    requiredTasks: [
      {
        key: "course-materials",
        title: "클라이언트가 바꾼 제목",
        dueDate: "2026-09-08",
        completed: true,
      },
      {
        key: "free-webinar-assets",
        dueDate: "2026-09-03",
        completed: false,
      },
    ],
  });

  assert.deepEqual(
    parsed.requiredTasks.map((task) => [
      task.key,
      task.title,
      task.dueDate,
      task.completed,
    ]),
    [
      ["free-webinar-assets", "무료특강 배너 + 상페", "2026-09-03", false],
      ["paid-course-assets", "유료특강 배너 + 상페 + 동영상", "", false],
      ["course-materials", "교안", "2026-09-08", true],
    ],
  );
});

test("필수 작업 예정일은 날짜 형식이어야 한다", () => {
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        requiredTasks: [
          {
            key: "course-materials",
            dueDate: "9월 중",
            completed: false,
          },
        ],
      }),
    /교안 예정일 형식/u,
  );
});
