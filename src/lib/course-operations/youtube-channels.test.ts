import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYoutubeChannelSuggestions,
  decodeReadableUrl,
  displayYoutubeChannelName,
  findYoutubeChannelUrlByName,
  resolveYoutubeAppearanceChannel,
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
      alias: null,
    },
  ]);

  assert.equal(
    findYoutubeChannelUrlByName(suggestions, " 두시간부업만 "),
    "https://www.youtube.com/@두시간부업만",
  );
  assert.equal(findYoutubeChannelUrlByName(suggestions, "없는 채널"), "");
});

test("채널 별명으로 검색하고 표시할 수 있다", () => {
  const suggestions = buildYoutubeChannelSuggestions([{ channel: { name: "두시간 부업만 일로와", url: "https://youtube.test/dubu" }, alias: "두부" }]);
  assert.equal(findYoutubeChannelUrlByName(suggestions, "두부"), "https://youtube.test/dubu");
  assert.equal(displayYoutubeChannelName(suggestions, "두시간 부업만 일로와"), "두부");
});

test("출연에 저장한 채널 주소를 우선하고 주소가 비면 등록된 이름이나 별명으로 연결한다", () => {
  const href = "https://www.youtube.com/@one";
  const other = "https://www.youtube.com/@two";
  const suggestions = [{ channelName: "첫 채널", alias: "하나", channelUrl: href }];
  assert.deepEqual(resolveYoutubeAppearanceChannel(suggestions, "첫 채널", other), { name: "하나", href: other });
  assert.deepEqual(resolveYoutubeAppearanceChannel(suggestions, "하나", ""), { name: "하나", href });
  const ambiguous = [...suggestions, { channelName: "다른 채널", alias: "하나", channelUrl: other }];
  assert.equal(resolveYoutubeAppearanceChannel(ambiguous, "하나", null).href, null);
  assert.equal(resolveYoutubeAppearanceChannel(ambiguous, "하나", other).href, other);
  assert.equal(resolveYoutubeAppearanceChannel([], "미등록", "javascript:alert(1)").href, null);
});
