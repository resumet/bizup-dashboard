import assert from "node:assert/strict";
import test from "node:test";

import { buildCourseOptionInviteMap, validateInviteValues } from "./invite";

test("입장코드는 4~6글자이고 링크는 HTTPS여야 한다", () => {
  assert.deepEqual(
    validateInviteValues({
      entryCode: "ABCD",
      linkName: "https://example.com/invite",
    }),
    [],
  );
  assert.deepEqual(
    validateInviteValues({
      entryCode: "ABCDEF",
      linkName: "https://example.com/invite",
    }),
    [],
  );
  assert.ok(
    validateInviteValues({ entryCode: "ABC", linkName: "http://example.com" })
      .length >= 2,
  );
  assert.ok(
    validateInviteValues({
      entryCode: "ABCDEFG",
      linkName: "https://example.com",
    }).some((error) => error.includes("4~6글자")),
  );
  assert.ok(
    validateInviteValues({ entryCode: "", linkName: "" }).some((error) =>
      error.includes("모두 입력"),
    ),
  );
});

test("강의 옵션과 명단 옵션이 반 접미사만 달라도 초대 정보를 연결한다", () => {
  assert.deepEqual(
    buildCourseOptionInviteMap(
      ["기본반", "프리미엄반"],
      [
        {
          optionName: "기본반",
          entryCode: "1234",
          linkName: "https://open.kakao.com/o/basic",
        },
        {
          optionName: "프리미엄",
          entryCode: "5678",
          linkName: "https://open.kakao.com/o/premium",
        },
      ],
    ),
    {
      기본반: {
        entryCode: "1234",
        linkName: "https://open.kakao.com/o/basic",
      },
      프리미엄반: {
        entryCode: "5678",
        linkName: "https://open.kakao.com/o/premium",
      },
    },
  );
});

test("완화된 옵션명이 여러 개면 잘못 자동 연결하지 않는다", () => {
  assert.deepEqual(
    buildCourseOptionInviteMap(
      ["VIP반"],
      [
        { optionName: "VIP", entryCode: "1111", linkName: "https://a.test" },
        { optionName: "VIP과정", entryCode: "2222", linkName: "https://b.test" },
      ],
    ),
    {},
  );
});
