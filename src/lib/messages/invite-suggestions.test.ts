import assert from "node:assert/strict";
import test from "node:test";

import { recommendInviteLinks } from "./invite-suggestions";

test("같은 강의명과 옵션명의 과거 링크를 가장 먼저 추천한다", () => {
  const recommendations = recommendInviteLinks(
    [
      {
        courseName: "다른 강의",
        optionName: "평일반",
        linkName: "https://example.com/recent",
        usedAt: "2026-08-27T12:00:00.000Z",
      },
      {
        courseName: "AI 실전 강의",
        optionName: "주말반",
        linkName: "https://example.com/exact",
        usedAt: "2026-08-26T12:00:00.000Z",
      },
    ],
    "AI 실전 강의",
    "주말반",
  );

  assert.equal(recommendations[0]?.linkName, "https://example.com/exact");
});

test("같은 링크는 최근 기록 하나만 추천한다", () => {
  const recommendations = recommendInviteLinks(
    [
      {
        courseName: "AI 강의",
        optionName: "A",
        linkName: "https://example.com/room",
        usedAt: "2026-08-27T12:00:00.000Z",
      },
      {
        courseName: "AI 강의",
        optionName: "A",
        linkName: "https://example.com/room",
        usedAt: "2026-08-26T12:00:00.000Z",
      },
    ],
    "AI 강의",
    "A",
  );

  assert.equal(recommendations.length, 1);
});
