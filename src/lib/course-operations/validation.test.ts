import assert from "node:assert/strict";
import test from "node:test";

import { isTemporaryFreeChatUrl, TEMPORARY_FREE_CHAT_URL } from "./course-page-links";
import { parseCourseOperationsInput } from "./validation";

const validInput = {
  name: "AI 수익화 클래스",
  instructorName: "권강사",
  freeWebinarAt: "2026-09-01T19:30:00+09:00",
  startsAt: "2026-09-10T00:00:00+09:00",
  earlyBirdEvent: "8월 31일까지 10만원 할인",
  first50Event: "교재 증정",
  courseDifferentiation: "  실무 사례를 활용한 단계별 실습 중심 강의  ",
  landingPageLink: "https://example.com/landing",
  freeKakaoRoom1Link: "https://open.kakao.com/o/free1",
  freeKakaoRoom2Link: "https://open.kakao.com/o/free2",
  paidKakaoRoomLink: " https://open.kakao.com/o/paid-students ",
  communicationRoomLink: "https://open.kakao.com/o/community",
  paymentLink: "https://example.com/payment",
  inquiryLink: "https://example.com/inquiry",
  curriculumLink: "https://example.com/curriculum",
  freeGiftLink: "https://example.com/gift",
  courseViewingLink: "https://example.com/course",
  courseMaterialsLink: "https://example.com/materials",
  courseCanvaLink: "https://www.canva.com/design/example",
  customLinks: [
    { name: "강사 자료실", url: "https://example.com/instructor-files" },
  ],
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
      landingUtm: "  utm_source=youtube&utm_medium=video  ",
    },
  ],
  liveVideos: [
    {
      name: "무료 특강 라이브",
      videoUrl: "https://www.youtube.com/watch?v=live123",
      note: "다시보기 공개",
    },
  ],
  rosterJobIds: ["f47ac10b-58cc-4372-a567-0e02b2c3d479"],
  messageProjectIds: [],
  freeAddressBookId: "",
};

test("새 강의는 무료단톡방1에 정식 또는 임시 주소가 필요하고 기존 강의는 빈 주소로 수정할 수 있다", () => {
  const create = (freeKakaoRoom1Link?: string) => parseCourseOperationsInput(
    { ...validInput, freeKakaoRoom1Link }, { requireFreeChatUrl: true },
  );
  for (const value of [undefined, "   ", "주소 오류"]) {
    assert.throws(() => create(value), /무료단톡방1/u);
  }
  assert.equal(create(validInput.freeKakaoRoom1Link).freeKakaoRoom1Link, validInput.freeKakaoRoom1Link);
  assert.equal(create(TEMPORARY_FREE_CHAT_URL).freeKakaoRoom1Link, TEMPORARY_FREE_CHAT_URL);
  assert.equal(parseCourseOperationsInput({ ...validInput, freeKakaoRoom1Link: "" }).freeKakaoRoom1Link, "");
});

test("무료단톡방 단축주소는 따로 저장하고 임시일 때 비활성 입력을 무시한다", () => {
  const chatFields = { freeKakaoRoom1ShortLink: "https://bizup.im/one", freeKakaoRoom2ShortLink: "https://bizup.im/two" };
  const saved = parseCourseOperationsInput({ ...validInput, ...chatFields });
  assert.equal(saved.freeKakaoRoom1ShortLink, chatFields.freeKakaoRoom1ShortLink);
  assert.equal(saved.freeKakaoRoom2ShortLink, chatFields.freeKakaoRoom2ShortLink);
  const temporary = parseCourseOperationsInput({ ...validInput, ...chatFields, freeKakaoRoom1Link: TEMPORARY_FREE_CHAT_URL, freeKakaoRoom2Link: "입력 중" });
  assert.deepEqual([temporary.freeKakaoRoom1ShortLink, temporary.freeKakaoRoom2Link, temporary.freeKakaoRoom2ShortLink], ["", "", ""]);
});

test("저장한 무료단톡방1이 임시 주소인 동안만 경고를 표시한다", () => {
  assert.ok(isTemporaryFreeChatUrl(TEMPORARY_FREE_CHAT_URL));
  assert.ok(isTemporaryFreeChatUrl(`${TEMPORARY_FREE_CHAT_URL}/?ref=copy`));
  for (const value of [null, "", validInput.freeKakaoRoom1Link, `${TEMPORARY_FREE_CHAT_URL}other`]) {
    assert.equal(isTemporaryFreeChatUrl(value), false);
  }
});

test("강사 닉네임은 선택 입력이며 양끝 공백을 정리하고 최대 120자까지 저장한다", () => {
  assert.equal(parseCourseOperationsInput(validInput).instructorNickname, "");
  assert.equal(parseCourseOperationsInput({ ...validInput, instructorNickname: " 라스트원 " }).instructorNickname, "라스트원");
  assert.throws(() => parseCourseOperationsInput({ ...validInput, instructorNickname: "가".repeat(121) }), /강사 닉네임/u);
});

test("강의 운영 입력값을 DB 저장 형식으로 변환한다", () => {
  const parsed = parseCourseOperationsInput(validInput);
  assert.equal(parsed.options[0].listPrice, 500000);
  assert.equal(parsed.options[0].salePrice, 390000);
  assert.equal(parsed.options[0].groupChatLink, "https://open.kakao.com/o/paid");
  assert.equal(parsed.options[0].entryCode, "1234");
  assert.equal(parsed.freeWebinarAt, "2026-09-01T10:30:00.000Z");
  assert.equal(parsed.startsAt, "2026-09-09T15:00:00.000Z");
  assert.equal(parsed.landingPageLink, "https://example.com/landing");
  assert.equal(parsed.freeKakaoRoom1Link, "https://open.kakao.com/o/free1");
  assert.equal(parsed.paidKakaoRoomLink, "https://open.kakao.com/o/paid-students");
  assert.equal(parsed.courseMaterialsLink, "https://example.com/materials");
  assert.equal(parsed.courseCanvaLink, "https://www.canva.com/design/example");
  assert.equal(
    parsed.courseDifferentiation,
    "실무 사례를 활용한 단계별 실습 중심 강의",
  );
  assert.equal(
    parsed.youtubeAppearances[0].landingUtm,
    "utm_source=youtube&utm_medium=video",
  );
  assert.deepEqual(parsed.customLinks, [
    { name: "강사 자료실", url: "https://example.com/instructor-files" },
  ]);
  assert.deepEqual(parsed.liveVideos[0], {
    name: "무료 특강 라이브",
    videoUrl: "https://www.youtube.com/watch?v=live123",
    note: "다시보기 공개",
  });
  assert.equal(parsed.rosterJobIds.length, 1);
});

test("기본 랜딩 QR은 기본 랜딩페이지와 별도로 검증하고 저장한다", () => {
  const parsed = parseCourseOperationsInput({ ...validInput, landingPageQrLink: " https://example.com/landing-qr " });
  assert.equal(parsed.landingPageQrLink, "https://example.com/landing-qr");
  assert.equal(parsed.landingPageLink, validInput.landingPageLink);
  assert.equal(parseCourseOperationsInput(validInput).landingPageQrLink, "");
  assert.throws(() => parseCourseOperationsInput({ ...validInput, landingPageQrLink: "javascript:alert(1)" }), /기본 랜딩 QR/);
});

test("기본 결제페이지와 결제페이지 QR은 별도 주소로 저장한다", () => {
  const parsed = parseCourseOperationsInput({ ...validInput, basicPaymentPageLink: " https://example.com/basic-payment " });
  assert.equal(parsed.basicPaymentPageLink, "https://example.com/basic-payment");
  assert.equal(parsed.paymentLink, validInput.paymentLink);
  assert.equal(parseCourseOperationsInput(validInput).basicPaymentPageLink, "");
  assert.throws(() => parseCourseOperationsInput({ ...validInput, basicPaymentPageLink: "javascript:alert(1)" }), /기본 결제페이지/);
});

test("강의 옵션이 없어도 입력값을 저장 형식으로 변환한다", () => {
  const parsed = parseCourseOperationsInput({ ...validInput, options: [] });
  assert.deepEqual(parsed.options, []);
});

test("강의 상세 저장은 유튜브 출연 정보를 검사하지 않는다", () => {
  const parsed = parseCourseOperationsInput({
    ...validInput,
    youtubeAppearances: [
      ...validInput.youtubeAppearances,
      {
        channelName: "자체 진행 채널",
        channelUrl: "",
        videoUrl: "",
        landingUtm: "",
      },
    ],
  }, { ignoreYoutubeAppearances: true });

  assert.deepEqual(parsed.youtubeAppearances, []);
});

test("강의 차별점은 선택값이며 최대 10,000자까지 저장한다", () => {
  assert.equal(
    parseCourseOperationsInput({ ...validInput, courseDifferentiation: "" })
      .courseDifferentiation,
    "",
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        courseDifferentiation: "가".repeat(10_001),
      }),
    /강의 차별점.*10,000자/u,
  );
});

test("기존 라이브 영상은 이름과 웹 주소가 필요하고 비고는 선택값이다", () => {
  const parsed = parseCourseOperationsInput({
    ...validInput,
    liveVideos: [
      {
        name: "  6월 무료 웨비나  ",
        videoUrl: "https://example.com/live",
        note: "  편집본  ",
      },
    ],
  });
  assert.deepEqual(parsed.liveVideos[0], {
    name: "6월 무료 웨비나",
    videoUrl: "https://example.com/live",
    note: "편집본",
  });
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        liveVideos: [{ name: "", videoUrl: "https://example.com", note: "" }],
      }),
    /라이브 영상 이름/u,
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        liveVideos: [{ name: "라이브", videoUrl: "javascript:alert(1)", note: "" }],
      }),
    /라이브 영상 주소.*http 또는 https/u,
  );
});

test("강사자료 폴더 링크는 비어 있거나 HTTP·HTTPS 주소여야 한다", () => {
  assert.equal(
    parseCourseOperationsInput({ ...validInput, courseMaterialsLink: "" })
      .courseMaterialsLink,
    "",
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        courseMaterialsLink: "javascript:alert(1)",
      }),
    /강사자료 폴더 링크.*http 또는 https/u,
  );
});

test("교안(캔바) 링크는 비어 있거나 HTTP·HTTPS 주소여야 한다", () => {
  assert.equal(
    parseCourseOperationsInput({ ...validInput, courseCanvaLink: "" })
      .courseCanvaLink,
    "",
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        courseCanvaLink: "javascript:alert(1)",
      }),
    /교안\(캔바\) 링크.*http 또는 https/u,
  );
});

test("사전질문 폼과 응답지 주소는 서로 독립적으로 입력하거나 비울 수 있다", () => {
  for (const field of ["preQuestionFormLink", "preQuestionResponsesLink"] as const) {
    const link = "https://example.com/" + field;
    assert.equal(parseCourseOperationsInput({ ...validInput, [field]: link })[field], link);
    assert.equal(parseCourseOperationsInput({ ...validInput, [field]: "" })[field], "");
    assert.equal(parseCourseOperationsInput(validInput)[field], "");
    assert.throws(() => parseCourseOperationsInput({ ...validInput, [field]: "javascript:void(0)" }), /http 또는 https/);
  }
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

test("커스텀 링크는 이름과 HTTP·HTTPS 주소가 필요하다", () => {
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        customLinks: [{ name: "", url: "https://example.com" }],
      }),
    /커스텀 링크 이름/u,
  );
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        customLinks: [{ name: "자료", url: "javascript:alert(1)" }],
      }),
    /커스텀 링크 주소.*http 또는 https/u,
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
  assert.throws(
    () =>
      parseCourseOperationsInput({
        ...validInput,
        startsAt: "2026-09-01T00:00:00+09:00",
      }),
    /무료 웨비나 날짜 다음 날/u,
  );
});

test("등록한 옵션의 할인가가 정가보다 높을 수 없다", () => {
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
          {
            channelName: "채널",
            channelUrl: "youtube",
            videoUrl: "",
            landingUtm: "",
          },
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
        landingUtm: "",
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

test("수강생 명단을 여러 개 연결할 수 있다", () => {
  const parsed = parseCourseOperationsInput({
    ...validInput,
    rosterJobIds: [
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    ],
  });

  assert.equal(parsed.rosterJobIds.length, 2);
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
