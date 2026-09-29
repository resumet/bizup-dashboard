import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYoutubeChannelSuggestions,
  decodeReadableUrl,
  findYoutubeChannelUrlByName,
} from "./youtube-channels";

test("인코딩된 한글 URL을 읽기 쉬운 주소로 바꾼다", () => {
  assert.equal(
    decodeReadableUrl(
      "https://www.youtube.com/@%EB%91%90%EC%8B%9C%EA%B0%84%EB%B6%80%EC%97%85%EB%A7%8C",
    ),
    "https://www.youtube.com/@두시간부업만",
  );
});

test("유튜브 채널관리 목록의 채널 후보 순서를 유지하면서 중복을 제거한다", () => {
  const suggestions = buildYoutubeChannelSuggestions([
    {
      channel: {
        name: "두시간부업만",
        url: "https://www.youtube.com/@%EB%91%90%EC%8B%9C%EA%B0%84%EB%B6%80%EC%97%85%EB%A7%8C",
      },
    },
    {
      channel: {
        name: "두시간부업만",
        url: "https://www.youtube.com/@두시간부업만",
      },
    },
    { channel: { name: "주소 없는 채널" } },
    { channel: null },
  ]);

  assert.deepEqual(suggestions, [
    {
      channelName: "두시간부업만",
      channelUrl: "https://www.youtube.com/@두시간부업만",
    },
  ]);

  assert.equal(
    findYoutubeChannelUrlByName(suggestions, " 두시간부업만 "),
    "https://www.youtube.com/@두시간부업만",
  );
  assert.equal(findYoutubeChannelUrlByName(suggestions, "없는 채널"), "");
});
